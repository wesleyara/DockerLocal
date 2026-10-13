import { Inject, Injectable, Logger } from '@nestjs/common';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AutostopLastRun } from '@dockerlocal/shared';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/configuration';

interface AutostopFile {
  enabled: boolean;
  excluded: string[];
  lastBootId?: string;
  lastRun?: AutostopLastRun | null;
}

/**
 * Persistência do auto-stop em `<DATA_DIR>/autostop.json`. Arquivo próprio
 * (não o config.json do ADR-10) para não disputar read-modify-write com o
 * FsConfigService. Falha de escrita LANÇA — a UI não pode mostrar sucesso
 * falso para uma lista que sumiria no próximo restart.
 */
@Injectable()
export class AutostopConfigService {
  private readonly logger = new Logger(AutostopConfigService.name);
  private readonly filePath: string;
  private data: AutostopFile = { enabled: true, excluded: [], lastRun: null };

  constructor(@Inject(APP_CONFIG) config: Pick<AppConfig, 'dataDir'>) {
    this.filePath = join(config.dataDir, 'autostop.json');
    this.load();
  }

  get enabled(): boolean {
    return this.data.enabled;
  }

  get excluded(): string[] {
    return [...this.data.excluded];
  }

  get lastBootId(): string | undefined {
    return this.data.lastBootId;
  }

  get lastRun(): AutostopLastRun | null {
    return this.data.lastRun ?? null;
  }

  isExcluded(name: string): boolean {
    return this.data.excluded.includes(name.replace(/^\//, ''));
  }

  setEnabled(enabled: boolean): void {
    this.data.enabled = enabled;
    this.persist();
  }

  add(name: string): void {
    const clean = name.replace(/^\//, '');
    if (this.data.excluded.includes(clean)) return;
    this.data.excluded.push(clean);
    this.persist();
  }

  remove(name: string): boolean {
    const clean = name.replace(/^\//, '');
    const before = this.data.excluded.length;
    this.data.excluded = this.data.excluded.filter((n) => n !== clean);
    if (this.data.excluded.length === before) return false;
    this.persist();
    return true;
  }

  setLastBootId(id: string): void {
    this.data.lastBootId = id;
    this.persist();
  }

  setLastRun(run: AutostopLastRun): void {
    this.data.lastRun = run;
    try {
      this.persist();
    } catch (err) {
      this.logger.warn(
        `Falha ao gravar último resultado: ${(err as Error).message}`,
      );
    }
  }

  private load(): void {
    try {
      const parsed = JSON.parse(
        readFileSync(this.filePath, 'utf8'),
      ) as Partial<AutostopFile>;
      this.data = {
        enabled: parsed.enabled ?? true,
        excluded: Array.isArray(parsed.excluded) ? parsed.excluded : [],
        ...(parsed.lastBootId ? { lastBootId: parsed.lastBootId } : {}),
        lastRun: parsed.lastRun ?? null,
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn(
          `Falha ao ler ${this.filePath}: ${(err as Error).message}`,
        );
      }
    }
  }

  private persist(): void {
    mkdirSync(join(this.filePath, '..'), { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    renameSync(tmp, this.filePath);
  }
}
