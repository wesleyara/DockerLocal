import { Controller, Get } from '@nestjs/common';
import { DockerService, PingResult } from '../docker/docker.service';

@Controller('system')
export class SystemController {
  constructor(private readonly dockerService: DockerService) {}

  @Get('ping')
  async ping(): Promise<PingResult> {
    return this.dockerService.ping();
  }
}
