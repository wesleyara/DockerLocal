import { Global, Module } from '@nestjs/common';
import { dockerClientProvider } from './docker.provider';
import { DockerService } from './docker.service';
import { DockerEventsService } from './docker-events.service';

@Global()
@Module({
  providers: [dockerClientProvider, DockerService, DockerEventsService],
  exports: [dockerClientProvider, DockerService, DockerEventsService],
})
export class DockerModule {}
