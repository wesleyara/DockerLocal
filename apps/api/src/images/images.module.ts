import { Module } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module';
import { FilesystemModule } from '../filesystem/filesystem.module';
import { ImagesController } from './images.controller';
import { ImagesService } from './images.service';
import { ImagePullService } from './image-pull.service';
import { ImageBuildCliService } from './image-build-cli.service';
import { ImageBuildService } from './image-build.service';

@Module({
  imports: [TasksModule, FilesystemModule],
  controllers: [ImagesController],
  providers: [
    ImagesService,
    ImagePullService,
    ImageBuildCliService,
    ImageBuildService,
  ],
})
export class ImagesModule {}
