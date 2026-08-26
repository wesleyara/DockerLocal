import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DockerModule } from './docker/docker.module';
import { SystemModule } from './system/system.module';
import { ContainersModule } from './containers/containers.module';
import { ImagesModule } from './images/images.module';
import { VolumesModule } from './volumes/volumes.module';
import { TasksModule } from './tasks/tasks.module';
import { FilesystemModule } from './filesystem/filesystem.module';

@Module({
  imports: [
    ConfigModule,
    DockerModule,
    SystemModule,
    ContainersModule,
    ImagesModule,
    VolumesModule,
    TasksModule,
    FilesystemModule,
  ],
})
export class AppModule {}
