import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { VolumesListResult } from '@dockerlocal/shared';
import { OriginGuard } from '../common/guards/origin.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { VolumesService } from './volumes.service';
import { removeVolumeQuerySchema } from './dto/remove-volume.dto';
import { createVolumeBodySchema } from './dto/create-volume.dto';
import { pruneVolumesBodySchema } from './dto/prune-volumes.dto';

@UseGuards(OriginGuard)
@Controller('volumes')
export class VolumesController {
  constructor(private readonly volumesService: VolumesService) {}

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
