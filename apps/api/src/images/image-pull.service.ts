import { Inject, Injectable } from '@nestjs/common';
import type Docker from 'dockerode';
import { DOCKER_CLIENT } from '../docker/docker.provider';
import { TaskRegistryService } from '../tasks/task-registry.service';

interface ProgressEvent {
  id?: string;
  status?: string;
  progress?: string;
  error?: string;
  errorDetail?: { message: string };
}

@Injectable()
export class ImagePullService {
  constructor(
    @Inject(DOCKER_CLIENT) private readonly docker: Docker,
    private readonly tasks: TaskRegistryService,
  ) {}

  start(ref: string): string {
    const handle = this.tasks.create('image-pull', `pull ${ref}`, { ref });

    this.docker.pull(
      ref,
      {},
      (err: Error | null, stream?: NodeJS.ReadableStream) => {
        if (err || !stream) {
          handle.fail(err?.message ?? 'Falha ao iniciar pull');
          return;
        }

        const onAbort = () =>
          (
            stream as NodeJS.ReadableStream & { destroy?: () => void }
          ).destroy?.();
        handle.signal.addEventListener('abort', onAbort);

        this.docker.modem.followProgress(
          stream,
          (finishErr: Error | null, output: ProgressEvent[]) => {
            handle.signal.removeEventListener('abort', onAbort);
            if (handle.signal.aborted) return;

            // followProgress reporta sucesso (callback sem `err`) mesmo quando o
            // pull falhou — o erro real vem como evento com `errorDetail` no meio
            // do fluxo, não como exceção. Ver skill dockerode-streams, seção 4.
            const failure = output?.find((o) => o.errorDetail || o.error);
            if (finishErr || failure) {
              handle.fail(
                failure?.errorDetail?.message ??
                  failure?.error ??
                  finishErr?.message ??
                  'Falha ao puxar imagem',
              );
              return;
            }
            handle.succeed({ ref });
          },
          (event: ProgressEvent) => {
            if (event.errorDetail) {
              handle.emit('stderr', event.errorDetail.message);
              return;
            }
            if (event.status) {
              const text = [event.id, event.status, event.progress]
                .filter(Boolean)
                .join(' ');
              handle.emit('stdout', text);
            }
          },
        );
      },
    );

    return handle.id;
  }
}
