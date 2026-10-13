import { Module } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module';
import { FilesystemModule } from '../filesystem/filesystem.module';
import { ImagesController } from './images.controller';
import { ImagesService } from './images.service';
import { ImagePullService } from './image-pull.service';
import { ImageBuildCliService } from './image-build-cli.service';
import { ImageBuildService } from './image-build.service';
import { ImageScanService } from './image-scan.service';

@Module({
  imports: [TasksModule, FilesystemModule],
  controllers: [ImagesController],
  providers: [
    ImagesService,
    ImagePullService,
    ImageBuildCliService,
    ImageBuildService,
    ImageScanService,
  ],
})
export class ImagesModule {}
