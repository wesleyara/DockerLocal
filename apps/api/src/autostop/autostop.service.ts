import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { readFileSync } from 'node:fs';
import type Docker from 'dockerode';
import type { Subscription } from 'rxjs';
import type {
  AutostopLastRun,
  AutostopStoppedEntry,
} from '@dockerlocal/shared';
import { DOCKER_CLIENT } from '../docker/docker.provider';
import { DockerEventsService } from '../docker/docker-events.service';
import { SelfDetectService, SELF_LABEL } from '../docker/self-detect.service';
import { HELPER_LABEL } from '../docker/internal-labels';
import { AutostopConfigService } from './autostop-config.service';

/** O daemon sobe os containers com restart policy em paralelo com o app. */
export const BOOT_WINDOW_MS = 120_000;
const BOOT_ID_PATH = '/proc/sys/kernel/random/boot_id';

export function readBootId(): string | null {
  try {
    return readFileSync(BOOT_ID_PATH, 'utf8').trim() || null;
  } catch {
    return null;
  }
}

@Injectable()
export class AutostopService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(AutostopService.name);
  private windowSub: Subscription | null = null;
  private windowTimer: NodeJS.Timeout | null = null;
  private current: AutostopStoppedEntry[] = [];

  constructor(
    @Inject(DOCKER_CLIENT) private readonly docker: Docker,
    private readonly selfDetect: SelfDetectService,
    private readonly events: DockerEventsService,
    private readonly config: AutostopConfigService,
  ) {}

  /** Sobrescrevível em testes. */
  bootIdReader: () => string | null = readBootId;

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.runIfNewBoot();
    } catch (err) {
      this.logger.warn(`Auto-stop falhou: ${(err as Error).message}`);
    }
  }

  onModuleDestroy(): void {
    this.closeWindow();
  }

  /** Gatilho de boot. Devolve true se a varredura rodou. */
  async runIfNewBoot(): Promise<boolean> {
    if (!this.config.enabled) return false;
    if (!this.selfDetect.selfContainerId) {
      this.logger.log(
        'Auto-stop ignorado: não está rodando como container do DockerLocal',
      );
      return false;
    }

    const bootId = this.bootIdReader();
    if (!bootId) {
      this.logger.warn(
        'boot_id indisponível; auto-stop desativado nesta execução',
      );
      return false;
    }
    if (bootId === this.config.lastBootId) return false;

    // Grava antes de parar qualquer coisa: se o app cair no meio, não repete.
    this.config.setLastBootId(bootId);
    this.logger.log(
      'Boot novo detectado; parando containers fora da lista de exclusão',
    );

    this.current = [];
    await this.sweep();
    this.openWindow();
    return true;
  }

  /** Varredura manual (botão "Executar agora"). Não abre janela de boot. */
  async runNow(): Promise<AutostopLastRun> {
    this.current = [];
    await this.sweep();
    return this.finish('manual');
  }

  private async sweep(): Promise<void> {
    const running = await this.docker.listContainers({ all: false });
    await Promise.allSettled(
      running
        .filter((c) => this.shouldStop(c.Id, c.Names, c.Labels))
        .map((c) => this.stop(c.Id, c.Names[0] ?? c.Id)),
    );
  }

  private shouldStop(
    id: string,
    names: string[] | undefined,
    labels: Record<string, string> | undefined,
  ): boolean {
    if (this.selfDetect.isSelfContainer(id)) return false;
    if (labels?.[SELF_LABEL] || labels?.[HELPER_LABEL]) return false;
    return !(names ?? []).some((n) => this.config.isExcluded(n));
  }

  private async stop(id: string, rawName: string): Promise<void> {
    const name = rawName.replace(/^\//, '');
    try {
      await this.docker.getContainer(id).stop();
      this.current.push({ name, ok: true });
    } catch (err) {
      // 304 = já estava parado (corrida com a janela de eventos)
      if ((err as { statusCode?: number }).statusCode === 304) return;
      this.current.push({ name, ok: false, error: (err as Error).message });
      this.logger.warn(`Falha ao parar ${name}: ${(err as Error).message}`);
    }
  }

  private openWindow(): void {
    this.windowSub = this.events.events$.subscribe((ev) => {
      if (ev.type !== 'container' || ev.action !== 'start') return;
      void this.stopStarted(ev.id, ev.name);
    });
    this.windowTimer = setTimeout(() => {
      this.closeWindow();
      this.finish('boot');
    }, BOOT_WINDOW_MS);
    this.windowTimer.unref?.();
  }

  private async stopStarted(id: string, name?: string): Promise<void> {
    try {
      const info = await this.docker.getContainer(id).inspect();
      if (!info.State.Running) return;
      if (!this.shouldStop(info.Id, [info.Name], info.Config.Labels)) return;
      await this.stop(info.Id, name ?? info.Name);
    } catch (err) {
      this.logger.warn(
        `Falha ao tratar start de ${id}: ${(err as Error).message}`,
      );
    }
  }

  private closeWindow(): void {
    this.windowSub?.unsubscribe();
    this.windowSub = null;
    if (this.windowTimer) clearTimeout(this.windowTimer);
    this.windowTimer = null;
  }

  private finish(trigger: AutostopLastRun['trigger']): AutostopLastRun {
    const run: AutostopLastRun = {
      trigger,
      at: Date.now(),
      stopped: [...this.current],
    };
    this.config.setLastRun(run);
    return run;
  }
}
