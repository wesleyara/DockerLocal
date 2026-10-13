import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import type { SystemDiskUsage, SystemPruneResult } from '@dockerlocal/shared';
import { DockerService, PingResult } from '../docker/docker.service';
import { LogSessionService } from '../containers/log-session.service';
import { OriginGuard } from '../common/guards/origin.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { SystemService } from './system.service';
import { pruneSystemBodySchema, PruneSystemBody } from './dto/prune-system.dto';

@UseGuards(OriginGuard)
@Controller('system')
export class SystemController {
  constructor(
    private readonly dockerService: DockerService,
    private readonly logSessions: LogSessionService,
    private readonly systemService: SystemService,
  ) {}

  @Get('ping')
  async ping(): Promise<PingResult> {
    return this.dockerService.ping();
  }

  @Get('info')
  info(): { activeLogSessions: number } {
    return { activeLogSessions: this.logSessions.activeCount };
  }

  @Get('disk-usage')
  async diskUsage(): Promise<SystemDiskUsage> {
    return this.systemService.diskUsage();
  }

  @Post('prune')
  @HttpCode(200)
  async prune(
    @Body(new ZodValidationPipe(pruneSystemBodySchema)) body: unknown,
  ): Promise<SystemPruneResult> {
    return this.systemService.prune(body as PruneSystemBody);
  }
}
