import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DockerModule } from './docker/docker.module';
import { SystemModule } from './system/system.module';
import { ContainersModule } from './containers/containers.module';

@Module({
  imports: [ConfigModule, DockerModule, SystemModule, ContainersModule],
})
export class AppModule {}
