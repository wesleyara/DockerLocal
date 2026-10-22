import * as pty from 'node-pty';
import type { TaskHandle } from '../../tasks/task-registry.service';

const KILL_GRACE_MS = 10_000;

/** Largura fixa: o xterm do front usa o mesmo valor, senão o redesenho in-place quebra. */
export const PTY_COLS = 100;
export const PTY_ROWS = 40;

/**
 * Roda um CLI num pseudo-terminal e despeja os bytes crus na Task, para o
 * xterm do front reproduzir exatamente o que o terminal mostraria (barras de
 * progresso, estágios do BuildKit redesenhando no lugar). Argumentos sempre
 * em array — o node-pty faz execvp, nunca passa por shell.
 */
export function runInPty(
  handle: TaskHandle,
  file: string,
  args: string[],
  opts: { cwd: string; env?: Record<string, string> },
): Promise<number> {
  return new Promise((resolvePromise) => {
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (v !== undefined) env[k] = v;
    }
    delete env.NO_COLOR;
    Object.assign(env, opts.env, { TERM: 'xterm-256color' });

    let term: pty.IPty;
    try {
      term = pty.spawn(file, args, {
        name: 'xterm-256color',
        cols: PTY_COLS,
        rows: PTY_ROWS,
        cwd: opts.cwd,
        env,
      });
    } catch (err) {
      handle.emit('stderr', err instanceof Error ? err.message : String(err));
      resolvePromise(-1);
      return;
    }

    term.onData((data) => handle.emitRaw(data));

    const onAbort = () => {
      term.kill('SIGINT');
      const killTimer = setTimeout(() => term.kill('SIGKILL'), KILL_GRACE_MS);
      killTimer.unref?.();
    };
    handle.signal.addEventListener('abort', onAbort);

    term.onExit(({ exitCode }) => {
      handle.signal.removeEventListener('abort', onAbort);
      resolvePromise(exitCode);
    });
  });
}
