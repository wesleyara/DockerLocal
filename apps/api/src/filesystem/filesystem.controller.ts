import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { Stats } from 'node:fs';
import { open, readFile, readdir, stat } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import type {
  FsDetectResult,
  FsEntry,
  FsListResult,
  FsReadResult,
  FsRoot,
} from '@dockerlocal/shared';
import { OriginGuard } from '../common/guards/origin.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  FileDetectService,
  isComposeFile,
  isDockerfileFile,
} from './file-detect.service';
import { PathSafetyService, translateFsError } from './path-safety.service';
import { listFsQuerySchema } from './dto/list-fs.dto';
import type { ListFsQuery } from './dto/list-fs.dto';
import { pathQuerySchema } from './dto/path-query.dto';
import type { PathQuery } from './dto/path-query.dto';
import { addFsRootBodySchema } from './dto/add-fs-root.dto';
import type { AddFsRootBody } from './dto/add-fs-root.dto';

const READ_MAX_BYTES = 512 * 1024;

// .env/.pem/.key nunca são exibidos, mesmo que o file browser precise poder
// *selecionar* um .env como argumento do compose (fases 7/8).
const READ_BLOCKLIST = /(^|\.)env(\..+)?$|\.pem$|\.key$/i;
const READ_ALLOWLIST = /^Dockerfile(\..+)?$|\.ya?ml$/i;

@UseGuards(OriginGuard)
@Controller('fs')
export class FilesystemController {
  constructor(
    private readonly pathSafety: PathSafetyService,
    private readonly fileDetect: FileDetectService,
  ) {}

  @Get('roots')
  roots(): FsRoot[] {
    return this.pathSafety.listRoots();
  }

  @Post('roots')
  @HttpCode(201)
  async addRoot(
    @Body(new ZodValidationPipe(addFsRootBodySchema)) body: AddFsRootBody,
  ): Promise<FsRoot> {
    return this.pathSafety.addRoot(body.path);
  }

  @Delete('roots')
  @HttpCode(200)
  removeRoot(@Query(new ZodValidationPipe(pathQuerySchema)) query: PathQuery): {
    ok: boolean;
  } {
    return { ok: this.pathSafety.removeRoot(query.path) };
  }

  @Get('list')
  async list(
    @Query(new ZodValidationPipe(listFsQuerySchema)) query: ListFsQuery,
  ): Promise<FsListResult> {
    const real = await this.pathSafety.resolveSafe(query.path);

    const info = await stat(real).catch(translateFsError);
    if (!info.isDirectory()) {
      throw new BadRequestException('Caminho não é um diretório');
    }

    const dirents = await readdir(real, { withFileTypes: true }).catch(
      translateFsError,
    );

    const entries: FsEntry[] = [];
    for (const dirent of dirents) {
      if (!query.showHidden && dirent.name.startsWith('.')) continue;

      const entryPath = join(real, dirent.name);
      const isDirectory = dirent.isDirectory();

      let entryStat: Stats;
      try {
        entryStat = await stat(entryPath);
      } catch {
        continue; // symlink quebrado, removido entre o readdir e o stat etc.
      }

      entries.push({
        name: dirent.name,
        path: entryPath,
        isDirectory,
        isCompose: !isDirectory && isComposeFile(dirent.name),
        isDockerfile: !isDirectory && isDockerfileFile(dirent.name),
        size: isDirectory ? undefined : entryStat.size,
        modifiedAt: entryStat.mtime.toISOString(),
      });
    }

    entries.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    const isRoot = this.pathSafety.isRootPath(real);
    const parent = isRoot ? null : dirname(real);

    return { path: real, parent, entries };
  }

  @Get('detect')
  async detect(
    @Query(new ZodValidationPipe(pathQuerySchema)) query: PathQuery,
  ): Promise<FsDetectResult> {
    return this.fileDetect.detect(query.path);
  }

  @Get('read')
  async read(
    @Query(new ZodValidationPipe(pathQuerySchema)) query: PathQuery,
  ): Promise<FsReadResult> {
    const real = await this.pathSafety.resolveSafe(query.path);

    const info = await stat(real).catch(translateFsError);
    if (!info.isFile()) {
      throw new BadRequestException('Caminho não é um arquivo');
    }

    const name = basename(real);
    if (READ_BLOCKLIST.test(name) || !READ_ALLOWLIST.test(name)) {
      throw new ForbiddenException('Leitura deste arquivo não é permitida');
    }

    const truncated = info.size > READ_MAX_BYTES;
    const content = truncated
      ? await this.readHead(real, READ_MAX_BYTES)
      : await readFile(real, 'utf-8');

    return { path: real, content, truncated };
  }

  private async readHead(path: string, bytes: number): Promise<string> {
    const handle = await open(path, 'r');
    try {
      const buffer = Buffer.alloc(bytes);
      const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
      return buffer.toString('utf-8', 0, bytesRead);
    } finally {
      await handle.close();
    }
  }
}
