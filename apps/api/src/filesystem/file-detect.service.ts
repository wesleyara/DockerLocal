import { BadRequestException, Injectable } from '@nestjs/common';
import { readdir, stat } from 'node:fs/promises';
import type { FsDetectResult } from '@dockerlocal/shared';
import { PathSafetyService, translateFsError } from './path-safety.service';

const COMPOSE_NAME = /^(docker-compose|compose)\.ya?ml$/i;
const DOCKERFILE_NAME = /^Dockerfile(\..+)?$/;

export function isComposeFile(name: string): boolean {
  return COMPOSE_NAME.test(name);
}

export function isDockerfileFile(name: string): boolean {
  return DOCKERFILE_NAME.test(name);
}

@Injectable()
export class FileDetectService {
  constructor(private readonly pathSafety: PathSafetyService) {}

  async detect(requestedPath: string): Promise<FsDetectResult> {
    const real = await this.pathSafety.resolveSafe(requestedPath);

    const info = await stat(real).catch(translateFsError);
    if (!info.isDirectory()) {
      throw new BadRequestException('Caminho não é um diretório');
    }

    const entries = await readdir(real, { withFileTypes: true }).catch(
      translateFsError,
    );

    const composeFiles = entries
      .filter((e) => e.isFile() && isComposeFile(e.name))
      .map((e) => e.name)
      .sort();
    const dockerfiles = entries
      .filter((e) => e.isFile() && isDockerfileFile(e.name))
      .map((e) => e.name)
      .sort();

    const kind: FsDetectResult['kind'] =
      composeFiles.length > 0
        ? 'compose'
        : dockerfiles.length > 0
          ? 'dockerfile'
          : 'none';

    return { kind, composeFiles, dockerfiles };
  }
}
