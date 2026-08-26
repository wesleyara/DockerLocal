import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { existsSync, readFileSync } from 'node:fs';
import { hostname } from 'node:os';
import type Docker from 'dockerode';
import { DOCKER_CLIENT } from './docker.provider';

export const SELF_LABEL = 'com.dockerlocal.self';

/**
 * Descobre se o processo atual roda dentro do próprio container do
 * DockerLocal — e qual é o id/imagem desse container — para bloquear
 * ações que se auto-destruiriam (ver "Auto-preservação" na fase 9).
 *
 * Três fontes, na ordem em que são confiáveis dentro de um container:
 * 1. `/proc/self/cgroup` — funciona mesmo se HOSTNAME foi customizado.
 * 2. `HOSTNAME` — Docker usa o id curto do container por padrão.
 * 3. Label `com.dockerlocal.self=true` — fallback por varredura, cobre
 *    o caso de HOSTNAME customizado E cgroup v2 sem o path esperado.
 *
 * Fora de um container (dev nativo via `pnpm dev`, ou o binário standalone
 * da fase 9), nada bate e tudo segue funcionando normalmente com isSelf
 * sempre false — e a varredura por label (3) só roda se `runningInContainer()`
 * confirmar que o processo ESTÁ containerizado. Sem essa guarda, rodar o
 * binário standalone contra o mesmo daemon onde uma instância empacotada já
 * existe faria o binário se marcar (erroneamente) como sendo aquele container.
 */
@Injectable()
export class SelfDetectService implements OnModuleInit {
  private readonly logger = new Logger(SelfDetectService.name);
  private containerId: string | null = null;
  private imageId: string | null = null;
  private names: string[] = [];

  constructor(@Inject(DOCKER_CLIENT) private readonly docker: Docker) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.detect();
    } catch (err) {
      this.logger.warn(
        `Auto-detecção do próprio container falhou (seguindo sem isSelf): ${(err as Error).message}`,
      );
    }
  }

  get selfContainerId(): string | null {
    return this.containerId;
  }

  get selfImageId(): string | null {
    return this.imageId;
  }

  /** Aceita id completo, id curto ou nome (com ou sem "/" inicial). */
  isSelfContainer(ref: string): boolean {
    if (!this.containerId) return false;
    const clean = ref.replace(/^\//, '');
    return (
      this.containerId === clean ||
      this.containerId.startsWith(clean) ||
      clean.startsWith(this.containerId) ||
      this.names.includes(clean)
    );
  }

  isSelfImage(ref: string): boolean {
    if (!this.imageId) return false;
    const clean = ref.replace(/^sha256:/, '');
    const self = this.imageId.replace(/^sha256:/, '');
    return self === clean || self.startsWith(clean) || clean.startsWith(self);
  }

  private async detect(): Promise<void> {
    if (!this.runningInContainer()) return;

    const candidate = this.fromCgroup() ?? this.fromHostname();

    if (candidate) {
      const info = await this.docker.getContainer(candidate).inspect();
      this.adopt(info);
      return;
    }

    const found = await this.docker.listContainers({
      all: true,
      filters: JSON.stringify({ label: [`${SELF_LABEL}=true`] }),
    });
    if (found.length === 1) {
      const info = await this.docker.getContainer(found[0].Id).inspect();
      this.adopt(info);
    }
  }

  /**
   * Sinal amplo de "isto é um container" — não precisa identificar QUAL,
   * só se vale a pena tentar. `/.dockerenv` é a convenção do próprio
   * Docker; o cgroup contendo "docker"/"containerd" cobre runtimes que não
   * criam esse marker. Roda só de dentro de um container mesmo, nunca no
   * binário standalone ou em `pnpm dev` — mesmo que outra instância
   * empacotada esteja rodando no MESMO daemon nesse momento.
   */
  private runningInContainer(): boolean {
    if (existsSync('/.dockerenv')) return true;
    try {
      const raw = readFileSync('/proc/self/cgroup', 'utf8');
      return /docker|containerd/i.test(raw);
    } catch {
      return false;
    }
  }

  private adopt(info: Docker.ContainerInspectInfo): void {
    this.containerId = info.Id;
    this.imageId = info.Image;
    this.names = [info.Name.replace(/^\//, '')];
    this.logger.log(
      `Rodando como o próprio container do DockerLocal (${info.Id.slice(0, 12)})`,
    );
  }

  private fromHostname(): string | null {
    const host = hostname();
    return /^[0-9a-f]{12}$/i.test(host) ? host : null;
  }

  private fromCgroup(): string | null {
    try {
      const raw = readFileSync('/proc/self/cgroup', 'utf8');
      const match = raw.match(/[0-9a-f]{64}/);
      return match ? match[0] : null;
    } catch {
      return null;
    }
  }
}
