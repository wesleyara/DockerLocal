import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { PassThrough } from 'node:stream';
import type Docker from 'dockerode';
import { DOCKER_CLIENT } from '../docker/docker.provider';
import { SelfDetectService } from '../docker/self-detect.service';
import { HELPER_LABEL } from '../docker/internal-labels';

/** Versão travada em docs/decisoes.md (ADR-13), mesmo padrão do trivy. */
export const HELPER_IMAGE = 'busybox:1.37.0';
export { HELPER_LABEL };
const VOLUME_LABEL = 'com.dockerlocal.volume';

const IDLE_MS = 120_000;
export const HELPER_ROOT = '/v';

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

function containerNameFor(volume: string): string {
  // Nomes de volume aceitam [a-zA-Z0-9][a-zA-Z0-9_.-]* — mesmo charset de
  // nome de container, então dá pra usar direto sem sanitização extra.
  return `dockerlocal-volbrowser-${volume}`;
}

/**
 * Um container busybox "sibling" por volume, criado sob demanda, para dar
 * ao app um jeito de ler/escrever dentro de um volume nomeado sem precisar
 * rodar como root no host (o mountpoint em /var/lib/docker/volumes é
 * root:root 700) nem depender de onde o daemon está (dev nativo, binário
 * standalone, ou o próprio app em container — Docker-outside-of-Docker).
 *
 * Ver ADR-13 em docs/decisoes.md para o raciocínio completo.
 */
@Injectable()
export class VolumeHelperService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VolumeHelperService.name);
  private readonly containers = new Map<string, Docker.Container>();
  private readonly idleTimers = new Map<string, NodeJS.Timeout>();
  private readonly pending = new Map<string, Promise<Docker.Container>>();
  private imageEnsured = false;

  constructor(
    @Inject(DOCKER_CLIENT) private readonly docker: Docker,
    private readonly selfDetect: SelfDetectService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.reapOrphans();
    } catch (err) {
      this.logger.warn(
        `Falha ao limpar helpers órfãos no boot: ${(err as Error).message}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.releaseAll();
  }

  /** Garante um helper rodando para o volume e devolve o container pronto pra exec/archive. */
  async acquire(volume: string): Promise<Docker.Container> {
    const existing = this.containers.get(volume);
    if (existing) {
      this.touchIdleTimer(volume);
      return existing;
    }

    const inflight = this.pending.get(volume);
    if (inflight) {
      return inflight;
    }

    const creation = this.create(volume).finally(() => {
      this.pending.delete(volume);
    });
    this.pending.set(volume, creation);
    return creation;
  }

  async exec(volume: string, argv: string[]): Promise<ExecResult> {
    const container = await this.acquire(volume);
    const exec = await container.exec({
      Cmd: argv,
      AttachStdout: true,
      AttachStderr: true,
      Tty: false,
    });

    // Sem `hijack`/`stdin` — este exec nunca escreve stdin, então é uma
    // resposta HTTP streamada comum (mesmo caminho de `container.logs()`),
    // não uma conexão hijacked upgrade-to-raw-TCP. `hijack:true` aqui
    // prendia a conexão indefinidamente: sem stdin pra fechar do lado do
    // cliente, o daemon nunca emitia o 'end' que o lado hijacked espera.
    const stream = (await exec.start({})) as NodeJS.ReadableStream & {
      destroy?: () => void;
    };
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    stdout.setEncoding('utf8');
    stderr.setEncoding('utf8');
    this.docker.modem.demuxStream(stream, stdout, stderr);

    // `demuxStream` só faz `.write()` nos PassThrough — nunca `.end()` —
    // então esperar 'end' NELES trava pra sempre. O sinal real de "acabou"
    // é o stream bruto da resposta HTTP ('end' OU 'close', a ordem entre
    // os dois varia).
    let out = '';
    let err = '';
    stdout.on('data', (chunk: string) => (out += chunk));
    stderr.on('data', (chunk: string) => (err += chunk));
    await new Promise<void>((resolve, reject) => {
      stream.once('end', resolve);
      stream.once('close', resolve);
      stream.once('error', reject);
    });

    const info = await exec.inspect();
    return { code: info.ExitCode ?? 0, stdout: out, stderr: err };
  }

  async release(volume: string): Promise<void> {
    this.clearIdleTimer(volume);
    const container = this.containers.get(volume);
    this.containers.delete(volume);
    if (!container) return;
    await this.removeQuiet(container);
  }

  async releaseAll(): Promise<void> {
    const volumes = [...this.containers.keys()];
    await Promise.all(volumes.map((v) => this.release(v)));
  }

  private async create(volume: string): Promise<Docker.Container> {
    // 404 legível antes de gastar um create em cima de um volume inexistente.
    await this.docker
      .getVolume(volume)
      .inspect()
      .catch(() => {
        throw new NotFoundException(`Volume "${volume}" não encontrado`);
      });

    await this.ensureImage();

    const readOnly = this.selfDetect.isSelfVolume(volume);
    const name = containerNameFor(volume);

    let container: Docker.Container;
    try {
      container = await this.docker.createContainer({
        name,
        Image: HELPER_IMAGE,
        Cmd: ['sleep', '2147483647'],
        Labels: {
          [HELPER_LABEL]: 'true',
          [VOLUME_LABEL]: volume,
        },
        HostConfig: {
          Mounts: [
            {
              Type: 'volume',
              Source: volume,
              Target: HELPER_ROOT,
              ReadOnly: readOnly,
            },
          ],
          NetworkMode: 'none',
          ReadonlyRootfs: true,
          CapDrop: ['ALL'],
          // DAC_OVERRIDE/DAC_READ_SEARCH: sem eles, ler dados de um serviço
          // rodando com outro uid (ex. postgres, uid 70, diretórios 700)
          // dá EACCES mesmo com root dentro do container.
          CapAdd: [
            'CHOWN',
            'DAC_OVERRIDE',
            'DAC_READ_SEARCH',
            'FOWNER',
            'FSETID',
          ],
          SecurityOpt: ['no-new-privileges'],
          Memory: 64 * 1024 * 1024,
          PidsLimit: 64,
        },
      });
    } catch (err) {
      const dockerErr = err as { statusCode?: number };
      if (dockerErr.statusCode === 409) {
        // Sobra de um crash anterior com o mesmo nome — limpa e recria.
        await this.docker.getContainer(name).remove({ force: true });
        return this.create(volume);
      }
      throw err;
    }

    await container.start();
    this.containers.set(volume, container);
    this.touchIdleTimer(volume);
    return container;
  }

  private async ensureImage(): Promise<void> {
    if (this.imageEnsured) return;
    const exists = await this.docker
      .getImage(HELPER_IMAGE)
      .inspect()
      .then(() => true)
      .catch(() => false);

    if (!exists) {
      await new Promise<void>((resolve, reject) => {
        this.docker.pull(
          HELPER_IMAGE,
          {},
          (err: Error | null, stream?: NodeJS.ReadableStream) => {
            if (err || !stream) {
              reject(err ?? new Error('Falha ao iniciar pull do helper'));
              return;
            }
            this.docker.modem.followProgress(stream, (finishErr) => {
              if (finishErr) reject(finishErr);
              else resolve();
            });
          },
        );
      });
    }
    this.imageEnsured = true;
  }

  private touchIdleTimer(volume: string): void {
    this.clearIdleTimer(volume);
    const timer = setTimeout(() => {
      this.release(volume).catch((err) =>
        this.logger.warn(
          `Falha ao liberar helper ocioso de "${volume}": ${(err as Error).message}`,
        ),
      );
    }, IDLE_MS);
    timer.unref();
    this.idleTimers.set(volume, timer);
  }

  private clearIdleTimer(volume: string): void {
    const timer = this.idleTimers.get(volume);
    if (timer) {
      clearTimeout(timer);
      this.idleTimers.delete(volume);
    }
  }

  private async removeQuiet(container: Docker.Container): Promise<void> {
    try {
      await container.remove({ force: true });
    } catch (err) {
      const dockerErr = err as { statusCode?: number };
      if (dockerErr.statusCode !== 404) {
        this.logger.warn(`Falha ao remover helper: ${(err as Error).message}`);
      }
    }
  }

  private async reapOrphans(): Promise<void> {
    const orphans = await this.docker.listContainers({
      all: true,
      filters: JSON.stringify({ label: [HELPER_LABEL] }),
    });
    await Promise.all(
      orphans.map((c) =>
        this.docker
          .getContainer(c.Id)
          .remove({ force: true })
          .catch(() => undefined),
      ),
    );
    if (orphans.length > 0) {
      this.logger.log(
        `Removidos ${orphans.length} helper(s) de volume órfão(s)`,
      );
    }
  }
}
