import { Global, Module } from '@nestjs/common';
import { dockerClientProvider } from './docker.provider';
import { DockerService } from './docker.service';
import { DockerEventsService } from './docker-events.service';
import { SelfDetectService } from './self-detect.service';

@Global()
@Module({
  providers: [
    dockerClientProvider,
    DockerService,
    DockerEventsService,
    SelfDetectService,
  ],
  exports: [
    dockerClientProvider,
    DockerService,
    DockerEventsService,
    SelfDetectService,
  ],
})
export class DockerModule {}
