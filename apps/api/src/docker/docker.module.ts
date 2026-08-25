import { Global, Module } from '@nestjs/common';
import { dockerClientProvider } from './docker.provider';
import { DockerService } from './docker.service';

@Global()
@Module({
  providers: [dockerClientProvider, DockerService],
  exports: [dockerClientProvider, DockerService],
})
export class DockerModule {}
