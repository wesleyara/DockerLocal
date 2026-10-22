import { BadRequestException, Injectable } from '@nestjs/common';
import { readdir } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { PathSafetyService } from '../filesystem/path-safety.service';
import {
  TaskHandle,
  TaskRegistryService,
} from '../tasks/task-registry.service';
import { runInPty } from '../common/utils/pty-runner';
import { BuildImageBody } from './dto/build-image.dto';

const CONTEXT_WARN_THRESHOLD = 20_000;

/**
 * Caminho padrão de build (`engine: 'cli'`): `docker build` via BuildKit.
 * Respeita `.dockerignore` nativamente, cache moderno, zero código de tar —
 * ver skill `compose-cli` seção 6 e ADR-03.
 */
@Injectable()
export class ImageBuildCliService {
  constructor(
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

    const handle = this.tasks.create('image-build', `build ${body.tags[0]}`, {
      contextPath,
      dockerfile: dockerfileAbs,
      tags: body.tags,
    });

    void this.warnIfHugeContext(handle, contextPath);
    this.run(handle, contextPath, dockerfileAbs, body).catch(() => {
      // run() já resolve sucesso/falha via handle — chegar aqui é bug interno.
    });

    return handle.id;
  }

  private async warnIfHugeContext(
    handle: TaskHandle,
    contextPath: string,
  ): Promise<void> {
    const count = await this.countFiles(
      contextPath,
      CONTEXT_WARN_THRESHOLD + 1,
    );
    if (count > CONTEXT_WARN_THRESHOLD) {
      handle.emit(
        'stderr',
        `Aviso: contexto com mais de ${CONTEXT_WARN_THRESHOLD} arquivos — sem um .dockerignore isso pode travar por minutos.`,
      );
    }
  }

  private async countFiles(dir: string, cap: number): Promise<number> {
    let count = 0;
    const stack = [dir];
    while (stack.length && count <= cap) {
      const current = stack.pop()!;
      let dirents: Dirent[];
      try {
        dirents = await readdir(current, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const dirent of dirents) {
        count++;
        if (count > cap) break;
        if (dirent.isDirectory()) stack.push(join(current, dirent.name));
      }
    }
    return count;
  }

  private async run(
    handle: TaskHandle,
    contextPath: string,
    dockerfileAbs: string,
    body: BuildImageBody,
  ): Promise<void> {
    try {
      const args = [
        'build',
        '--progress',
        'tty',
        '-f',
        dockerfileAbs,
        ...body.tags.flatMap((t) => ['-t', t]),
        ...Object.entries(body.buildArgs ?? {}).flatMap(([k, v]) => [
          '--build-arg',
          `${k}=${v}`,
        ]),
        ...(body.target ? ['--target', body.target] : []),
        ...(body.noCache ? ['--no-cache'] : []),
        contextPath,
      ];

      const code = await this.spawnBuild(handle, contextPath, args);
      if (code === 0) {
        handle.succeed({ tags: body.tags });
      } else {
        handle.fail(`docker build saiu com código ${code}`);
      }
    } catch (err) {
      handle.fail(
        err instanceof Error ? err.message : 'Falha ao executar build',
      );
    }
  }

  private spawnBuild(
    handle: TaskHandle,
    contextPath: string,
    args: string[],
  ): Promise<number> {
    return runInPty(handle, 'docker', args, {
      cwd: contextPath,
      env: { DOCKER_BUILDKIT: '1' },
    });
  }
}
