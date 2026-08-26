import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import type Docker from 'dockerode';
import ignore from 'ignore';
import tarFs from 'tar-fs';
import { DOCKER_CLIENT } from '../docker/docker.provider';
import { PathSafetyService } from '../filesystem/path-safety.service';
import {
  TaskHandle,
  TaskRegistryService,
} from '../tasks/task-registry.service';
import { BuildImageBody } from './dto/build-image.dto';

interface ProgressEvent {
  stream?: string;
  status?: string;
  id?: string;
  progress?: string;
  error?: string;
  errorDetail?: { message: string };
  aux?: { ID?: string };
}

/**
 * Fallback (`engine: 'api'`): dockerode.buildImage + tar-fs. Não depende do
 * CLI, mas usa o builder clássico — deprecado no Docker 29 (ADR-03). Sem
 * cache mount, sem multi-stage paralelo, sem `--secret`.
 */
@Injectable()
export class ImageBuildService {
  constructor(
    @Inject(DOCKER_CLIENT) private readonly docker: Docker,
    private readonly tasks: TaskRegistryService,
    private readonly pathSafety: PathSafetyService,
  ) {}

  async start(body: BuildImageBody): Promise<string> {
    const contextPath = await this.pathSafety.resolveSafe(body.contextPath);
    const dockerfileAbs = await this.pathSafety.resolveSafe(body.dockerfile);

    const rel = relative(contextPath, dockerfileAbs);
    if (rel.startsWith('..') || isAbsolute(rel)) {
      throw new BadRequestException(
        'Dockerfile precisa estar dentro do contexto de build',
      );
    }
    // Opção `dockerfile` do dockerode é relativa à raiz do contexto, com `/`
    // — path absoluto dá "Cannot locate specified Dockerfile".
    const dockerfileRelative = rel.split(sep).join('/');

    const handle = this.tasks.create('image-build', `build ${body.tags[0]}`, {
      contextPath,
      dockerfile: dockerfileAbs,
      tags: body.tags,
    });

    this.run(handle, contextPath, dockerfileRelative, body).catch(() => {
      // run() já resolve sucesso/falha via handle — chegar aqui é bug interno.
    });

    return handle.id;
  }

  private async run(
    handle: TaskHandle,
    contextPath: string,
    dockerfileRelative: string,
    body: BuildImageBody,
  ): Promise<void> {
    try {
      const ig = ignore();
      try {
        const raw = await readFile(join(contextPath, '.dockerignore'), 'utf8');
        ig.add(raw);
      } catch {
        // sem .dockerignore, contexto inteiro entra no tar
      }

      const pack = tarFs.pack(contextPath, {
        // tar-fs entrega path ABSOLUTO em `name` — relativizar e normalizar
        // separadores antes de consultar o .dockerignore (skill dockerode-streams §6).
        ignore: (name: string) => {
          const rel = relative(contextPath, name).split(sep).join('/');
          return rel !== '' && ig.ignores(rel);
        },
        dereference: false,
      });

      // O tipo de ImageBuildOptions só aceita uma tag em `t` — a primeira vai
      // no build, as demais entram depois via `getImage(id).tag()`.
      const [primaryTag, ...extraTags] = body.tags;
      const stream = await this.docker.buildImage(pack, {
        dockerfile: dockerfileRelative,
        t: primaryTag,
        buildargs: body.buildArgs,
        target: body.target,
        nocache: body.noCache,
      });

      const onAbort = () =>
        (
          stream as NodeJS.ReadableStream & { destroy?: () => void }
        ).destroy?.();
      handle.signal.addEventListener('abort', onAbort);

      await new Promise<void>((resolvePromise) => {
        this.docker.modem.followProgress(
          stream,
          (err: Error | null, output: ProgressEvent[]) => {
            handle.signal.removeEventListener('abort', onAbort);
            if (handle.signal.aborted) {
              resolvePromise();
              return;
            }

            // Build falho responde HTTP 200 — o erro chega como evento com
            // `errorDetail` no meio do fluxo, não como exceção.
            const failure = output?.find((o) => o.errorDetail || o.error);
            if (err || failure) {
              handle.fail(
                failure?.errorDetail?.message ??
                  failure?.error ??
                  err?.message ??
                  'Falha ao buildar imagem',
              );
              resolvePromise();
              return;
            }

            const aux = [...output].reverse().find((o) => o.aux?.ID);
            const imageId = aux?.aux?.ID;

            this.applyExtraTags(imageId, extraTags, handle)
              .then(() => {
                handle.succeed({ tags: body.tags, imageId });
                resolvePromise();
              })
              .catch(() => {
                handle.succeed({ tags: body.tags, imageId });
                resolvePromise();
              });
          },
          (event: ProgressEvent) => {
            if (event.errorDetail) {
              handle.emit('stderr', event.errorDetail.message);
              return;
            }
            if (event.stream) {
              handle.emit('stdout', event.stream.replace(/\n$/, ''));
              return;
            }
            if (event.status) {
              handle.emit(
                'stdout',
                [event.id, event.status, event.progress]
                  .filter(Boolean)
                  .join(' '),
              );
            }
          },
        );
      });
    } catch (err) {
      handle.fail(
        err instanceof Error ? err.message : 'Falha ao executar build',
      );
    }
  }

  private async applyExtraTags(
    imageId: string | undefined,
    extraTags: string[],
    handle: TaskHandle,
  ): Promise<void> {
    if (!imageId || extraTags.length === 0) return;
    for (const reference of extraTags) {
      const lastSlash = reference.lastIndexOf('/');
      const lastColon = reference.lastIndexOf(':');
      const hasTag = lastColon > lastSlash;
      const repo = hasTag ? reference.slice(0, lastColon) : reference;
      const tag = hasTag ? reference.slice(lastColon + 1) : undefined;
      try {
        await this.docker.getImage(imageId).tag({ repo, tag });
      } catch (err) {
        handle.emit(
          'stderr',
          `Falha ao aplicar tag "${reference}": ${err instanceof Error ? err.message : 'erro desconhecido'}`,
        );
      }
    }
  }
}
