import { Injectable, Logger } from '@nestjs/common';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

export interface StackRegistryEntry {
  project: string;
  workingDir: string;
  configFiles: string[];
  updatedAt: number;
}

/**
 * Persiste compose files já vistos em ~/.dockerlocal/stacks.json. Sem isso,
 * uma stack que sofreu `down` completo não deixa recurso nenhum com label
 * — some do discovery, e o usuário não teria como subi-la de novo pela UI.
 */
@Injectable()
export class StackRegistryService {
  private readonly logger = new Logger(StackRegistryService.name);
  private readonly filePath = join(homedir(), '.dockerlocal', 'stacks.json');
  private readonly entries = new Map<string, StackRegistryEntry>();

  constructor() {
    this.load();
  }

  list(): StackRegistryEntry[] {
    return [...this.entries.values()];
  }

  get(project: string): StackRegistryEntry | undefined {
    return this.entries.get(project);
  }

  upsert(entry: Omit<StackRegistryEntry, 'updatedAt'>): void {
    if (!entry.workingDir || entry.configFiles.length === 0) return;

    const existing = this.entries.get(entry.project);
    if (
      existing &&
      existing.workingDir === entry.workingDir &&
      existing.configFiles.join('\0') === entry.configFiles.join('\0')
    ) {
      return;
    }

    this.entries.set(entry.project, { ...entry, updatedAt: Date.now() });
    this.persist();
  }

  remove(project: string): boolean {
    const existed = this.entries.delete(project);
    if (existed) this.persist();
    return existed;
  }

  private load(): void {
    try {
      const raw = readFileSync(this.filePath, 'utf8');
      const data = JSON.parse(raw) as StackRegistryEntry[];
      for (const entry of data) this.entries.set(entry.project, entry);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn(
          `Falha ao ler registry de stacks: ${(err as Error).message}`,
        );
      }
    }
  }

  private persist(): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      writeFileSync(
        this.filePath,
        JSON.stringify([...this.entries.values()], null, 2),
      );
    } catch (err) {
      this.logger.warn(
        `Falha ao persistir registry de stacks: ${(err as Error).message}`,
      );
    }
  }
}
