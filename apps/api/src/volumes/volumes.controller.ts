import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type {
  VolumeFsListResult,
  VolumeFsReadResult,
  VolumesListResult,
} from '@dockerlocal/shared';
import { OriginGuard } from '../common/guards/origin.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { VolumesService } from './volumes.service';
import { VolumeFilesService } from './volume-files.service';
import { removeVolumeQuerySchema } from './dto/remove-volume.dto';
import { createVolumeBodySchema } from './dto/create-volume.dto';
import { pruneVolumesBodySchema } from './dto/prune-volumes.dto';
import {
  volumeFsMkdirBodySchema,
  volumeFsPathQuerySchema,
  volumeFsRenameBodySchema,
  volumeFsUploadQuerySchema,
  type VolumeFsMkdirBody,
  type VolumeFsPathQuery,
  type VolumeFsRenameBody,
  type VolumeFsUploadQuery,
} from './dto/volume-fs.dto';

@UseGuards(OriginGuard)
@Controller('volumes')
export class VolumesController {
  constructor(
    private readonly volumesService: VolumesService,
    private readonly filesService: VolumeFilesService,
  ) {}

  // Rotas de /:name/files* precisam vir ANTES de /:name (senão o Nest
  // tenta casar ":name" com o literal "files" da URL primeiro).

  @Get(':name/files')
  async listFiles(
    @Param('name') name: string,
    @Query(new ZodValidationPipe(volumeFsPathQuerySchema))
    query: VolumeFsPathQuery,
  ): Promise<VolumeFsListResult> {
    return this.filesService.list(name, query.path);
  }

  @Get(':name/files/read')
  async readFile(
    @Param('name') name: string,
    @Query(new ZodValidationPipe(volumeFsPathQuerySchema))
    query: VolumeFsPathQuery,
  ): Promise<VolumeFsReadResult> {
    return this.filesService.read(name, query.path);
  }

  @Get(':name/files/download')
  async downloadFile(
    @Param('name') name: string,
    @Query(new ZodValidationPipe(volumeFsPathQuerySchema))
    query: VolumeFsPathQuery,
    @Res() res: Response,
  ): Promise<void> {
    await this.filesService.download(name, query.path, res);
  }

  @Put(':name/files')
  async uploadFile(
    @Param('name') name: string,
    @Query(new ZodValidationPipe(volumeFsUploadQuerySchema))
    query: VolumeFsUploadQuery,
    @Req() req: Request,
  ): Promise<{ ok: true }> {
    await this.filesService.upload(name, query.path, req, {
      overwrite: query.overwrite ?? false,
      expectedMtime: query.expectedMtime,
    });
    return { ok: true };
  }

  @Post(':name/files/mkdir')
  @HttpCode(201)
  async mkdir(
    @Param('name') name: string,
    @Body(new ZodValidationPipe(volumeFsMkdirBodySchema))
    body: VolumeFsMkdirBody,
  ): Promise<{ ok: true }> {
    await this.filesService.mkdir(name, body.path);
    return { ok: true };
  }

  @Post(':name/files/rename')
  @HttpCode(200)
  async renameFile(
    @Param('name') name: string,
    @Body(new ZodValidationPipe(volumeFsRenameBodySchema))
    body: VolumeFsRenameBody,
  ): Promise<{ ok: true }> {
    await this.filesService.rename(name, body.from, body.to);
    return { ok: true };
  }

  @Delete(':name/files')
  async removeFile(
    @Param('name') name: string,
    @Query(new ZodValidationPipe(volumeFsPathQuerySchema))
    query: VolumeFsPathQuery,
  ): Promise<{ ok: true }> {
    await this.filesService.remove(name, query.path);
    return { ok: true };
  }

  @Get()
  async list(): Promise<VolumesListResult> {
    return this.volumesService.list();
  }

  @Post()
  @HttpCode(201)
  async create(
    @Body(new ZodValidationPipe(createVolumeBodySchema)) body: unknown,
  ) {
    return this.volumesService.create(body as never);
  }

  @Get(':name')
  async inspect(@Param('name') name: string) {
    return this.volumesService.inspect(name);
  }

  @Delete(':name')
  async remove(
    @Param('name') name: string,
    @Query(new ZodValidationPipe(removeVolumeQuerySchema)) query: unknown,
  ) {
    await this.volumesService.remove(name, query as never);
    return { ok: true };
  }

  @Post('prune')
  @HttpCode(200)
  async prune(
    @Body(new ZodValidationPipe(pruneVolumesBodySchema)) body: unknown,
  ) {
    return this.volumesService.prune(body as never);
  }
}
