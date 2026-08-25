import { Controller, Get } from '@nestjs/common';
import { DockerService, PingResult } from '../docker/docker.service';
import { LogSessionService } from '../containers/log-session.service';

@Controller('system')
export class SystemController {
  constructor(
    private readonly dockerService: DockerService,
    private readonly logSessions: LogSessionService,
  ) {}

  @Get('ping')
  async ping(): Promise<PingResult> {
    return this.dockerService.ping();
  }

  @Get('info')
  info(): { activeLogSessions: number } {
    return { activeLogSessions: this.logSessions.activeCount };
  }
}
