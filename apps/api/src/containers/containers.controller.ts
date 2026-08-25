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
import type { ContainerSummary } from '@dockerlocal/shared';
import { OriginGuard } from '../common/guards/origin.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ContainersService } from './containers.service';
import { listContainersQuerySchema } from './dto/list-containers.dto';
import { removeContainerQuerySchema } from './dto/remove-container.dto';
import {
  killContainerBodySchema,
  renameContainerBodySchema,
  restartContainerBodySchema,
  stopContainerBodySchema,
} from './dto/container-actions.dto';

@UseGuards(OriginGuard)
@Controller('containers')
export class ContainersController {
  constructor(private readonly containersService: ContainersService) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(listContainersQuerySchema)) query: unknown,
  ): Promise<ContainerSummary[]> {
    return this.containersService.list(query as never);
  }

  @Get(':id')
  async inspect(@Param('id') id: string) {
    return this.containersService.inspect(id);
  }

  @Post(':id/start')
  @HttpCode(200)
  async start(@Param('id') id: string) {
    await this.containersService.start(id);
    return { ok: true };
  }

  @Post(':id/stop')
  @HttpCode(200)
  async stop(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(stopContainerBodySchema)) body: unknown,
  ) {
    await this.containersService.stop(id, body as never);
    return { ok: true };
  }

  @Post(':id/restart')
  @HttpCode(200)
  async restart(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(restartContainerBodySchema)) body: unknown,
  ) {
    await this.containersService.restart(id, body as never);
    return { ok: true };
  }

  @Post(':id/kill')
  @HttpCode(200)
  async kill(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(killContainerBodySchema)) body: unknown,
  ) {
    await this.containersService.kill(id, body as never);
    return { ok: true };
  }

  @Post(':id/pause')
  @HttpCode(200)
  async pause(@Param('id') id: string) {
    await this.containersService.pause(id);
    return { ok: true };
  }

  @Post(':id/unpause')
  @HttpCode(200)
  async unpause(@Param('id') id: string) {
    await this.containersService.unpause(id);
    return { ok: true };
  }

  @Post(':id/rename')
  @HttpCode(200)
  async rename(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(renameContainerBodySchema)) body: unknown,
  ) {
    await this.containersService.rename(id, body as never);
    return { ok: true };
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @Query(new ZodValidationPipe(removeContainerQuerySchema)) query: unknown,
  ) {
    await this.containersService.remove(id, query as never);
    return { ok: true };
  }

  @Post('prune')
  @HttpCode(200)
  async prune() {
    return this.containersService.prune();
  }
}
