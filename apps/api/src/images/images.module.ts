import { Module } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module';
import { ImagesController } from './images.controller';
import { ImagesService } from './images.service';
import { ImagePullService } from './image-pull.service';

@Module({
  imports: [TasksModule],
  controllers: [ImagesController],
  providers: [ImagesService, ImagePullService],
})
export class ImagesModule {}
