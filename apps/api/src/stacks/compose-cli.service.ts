import { Injectable, NotFoundException } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { PathSafetyService } from '../filesystem/path-safety.service';
import {
  TaskHandle,
  TaskRegistryService,
} from '../tasks/task-registry.service';
import { LineSplitter } from '../common/utils/line-splitter';

const KILL_GRACE_MS = 10_000;

export interface RunOptions {
  project: string;
  kind: string;
  label: string;
  workingDir: string;
  configFiles: string[];
  args: string[];
  /** Só usado pelo `down`: se o compose file sumiu, tenta sem `-f`. */
  fallbackOnMissingFiles?: boolean;
  /** Avisos emitidos como primeiras linhas da task (stderr), antes do spawn. */
  preflightWarnings?: string[];
}

export interface StartResult {
  taskId: string;
  started: boolean;
}

/**
 * Compose e build passam por `spawn` do CLI — a Engine API não tem
 * conceito de "stack". `shell: false` sempre, array de argumentos sempre.
 */
@Injectable()
export class ComposeCliService {
  // project -> taskId da operação em andamento. Duas operações simultâneas
  // na mesma stack corrompem estado (ex.: up durante down).
  private readonly busy = new Map<string, string>();

  constructor(
    private readonly tasks: TaskRegistryService,
    private readonly pathSafety: PathSafetyService,
  ) {}

  busyTaskId(project: string): string | undefined {
    return this.busy.get(project);
  }

  /** Inicia a operação se a stack não estiver ocupada; senão devolve a task em andamento. */
  tryStart(opts: RunOptions): StartResult {
    const existing = this.busy.get(opts.project);
    if (existing) {
      return { taskId: existing, started: false };
    }

    const handle = this.tasks.create(opts.kind, opts.label, {
      project: opts.project,
    });
    this.busy.set(opts.project, handle.id);

    this.execute(handle, opts).catch(() => {
      // execute() já resolve sucesso/falha via handle — chegar aqui é bug interno.
    });

    return { taskId: handle.id, started: true };
  }

  /** `docker compose config --format json` — buffer, não é Task. */
  async config(workingDir: string, configFiles: string[]): Promise<unknown> {
    const cwd = await this.pathSafety.resolveSafe(workingDir);
    const files = await Promise.all(
      configFiles.map((f) => this.pathSafety.resolveSafe(f)),
    );

    const output = await this.runBuffered(cwd, [
      'compose',
      '--progress',
      'plain',
      '--ansi',
      'never',
      ...files.flatMap((f) => ['-f', f]),
      'config',
      '--format',
      'json',
    ]);
    return JSON.parse(output);
  }

  private async execute(handle: TaskHandle, opts: RunOptions): Promise<void> {
    try {
      for (const warning of opts.preflightWarnings ?? []) {
        handle.emit('stderr', warning);
      }

      let cwd: string;
      let files: string[];

      try {
        cwd = await this.pathSafety.resolveSafe(opts.workingDir);
        files = await Promise.all(
          opts.configFiles.map((f) => this.pathSafety.resolveSafe(f)),
        );
      } catch (err) {
        if (opts.fallbackOnMissingFiles && err instanceof NotFoundException) {
          handle.emit(
            'stderr',
            '[fallback] compose file não encontrado — tentando down sem -f, pelos labels do projeto.',
          );
          files = [];
          cwd = await this.pathSafety
            .resolveSafe(opts.workingDir)
            .catch(() => tmpdir());
        } else {
          throw err;
        }
      }

      const code = await this.spawnCompose(
        handle,
        cwd,
        opts.project,
        files,
        opts.args,
      );
      if (code === 0) {
        handle.succeed({ project: opts.project });
      } else {
        handle.fail(`docker compose saiu com código ${code}`);
      }
    } catch (err) {
      handle.fail(
        err instanceof Error ? err.message : 'Falha ao executar compose',
      );
    } finally {
      this.busy.delete(opts.project);
    }
  }

  private spawnCompose(
    handle: TaskHandle,
    cwd: string,
    project: string,
    configFiles: string[],
    args: string[],
  ): Promise<number> {
    return new Promise((resolvePromise) => {
      const child = spawn(
        'docker',
        [
          'compose',
          '--progress',
          'plain',
          '--ansi',
          'never',
          '-p',
          project,
          ...configFiles.flatMap((f) => ['-f', f]),
          ...args,
        ],
        {
          cwd,
          shell: false,
          env: {
            ...process.env,
            DOCKER_BUILDKIT: '1',
            BUILDKIT_PROGRESS: 'plain',
            NO_COLOR: '1',
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );

      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      // O progresso do compose sai no stderr — nunca trate como erro aqui,
      // só o exit code decide sucesso ou falha.
      child.stdout
        .pipe(new LineSplitter())
        .on('data', (t: string) => handle.emit('stdout', t));
      child.stderr
        .pipe(new LineSplitter())
        .on('data', (t: string) => handle.emit('stderr', t));

      const onAbort = () => {
        child.kill('SIGINT');
        const killTimer = setTimeout(() => {
          if (!child.killed) child.kill('SIGKILL');
        }, KILL_GRACE_MS);
        killTimer.unref?.();
      };
      handle.signal.addEventListener('abort', onAbort);

      child.on('close', (code) => {
        handle.signal.removeEventListener('abort', onAbort);
        resolvePromise(code ?? -1);
      });
      child.on('error', (err) => {
        handle.emit('stderr', err.message);
        resolvePromise(-1);
      });
    });
  }

  private runBuffered(cwd: string, args: string[]): Promise<string> {
    return new Promise((resolvePromise, reject) => {
      const child = spawn('docker', args, {
        cwd,
        shell: false,
        env: { ...process.env, NO_COLOR: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => (stdout += chunk));
      child.stderr.on('data', (chunk: string) => (stderr += chunk));

      child.on('close', (code) => {
        if (code === 0) resolvePromise(stdout);
        else
          reject(new Error(stderr.trim() || `docker saiu com código ${code}`));
      });
      child.on('error', reject);
    });
  }
}
