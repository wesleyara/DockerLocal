import { Injectable, Logger } from '@nestjs/common';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

interface DockerLocalConfig {
  fsRoots: string[];
}

/**
 * Raízes do file browser adicionadas pela UI em runtime (fase 9).
 * `FS_ROOTS` no `.env` continua sendo a base fixa lida só no boot; isso
 * aqui é a camada editável — persistida em ~/.dockerlocal/config.json,
 * mesmo padrão do stacks.json da fase 7, pra sobreviver a um restart do
 * processo sem exigir editar `.env` e reiniciar o container.
 */
@Injectable()
export class FsConfigService {
  private readonly logger = new Logger(FsConfigService.name);
  private readonly filePath = join(homedir(), '.dockerlocal', 'config.json');
  private roots: string[] = [];

  constructor() {
    this.load();
  }

  list(): string[] {
    return [...this.roots];
  }

  add(root: string): void {
    if (this.roots.includes(root)) return;
    this.roots.push(root);
    this.persist();
  }

  remove(root: string): boolean {
    const before = this.roots.length;
    this.roots = this.roots.filter((r) => r !== root);
    const removed = this.roots.length !== before;
    if (removed) this.persist();
    return removed;
  }

  private load(): void {
    try {
      const raw = readFileSync(this.filePath, 'utf8');
      const data = JSON.parse(raw) as DockerLocalConfig;
      this.roots = Array.isArray(data.fsRoots) ? data.fsRoots : [];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn(
          `Falha ao ler ${this.filePath}: ${(err as Error).message}`,
        );
      }
    }
  }

  private persist(): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      const data: DockerLocalConfig = { fsRoots: this.roots };
      writeFileSync(this.filePath, JSON.stringify(data, null, 2));
    } catch (err) {
      this.logger.warn(
        `Falha ao persistir ${this.filePath}: ${(err as Error).message}`,
      );
    }
  }
}
