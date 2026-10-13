import { Module } from '@nestjs/common';
import { ContainersModule } from '../containers/containers.module';
import { SystemController } from './system.controller';
import { SystemEventsController } from './system-events.controller';
import { SystemService } from './system.service';

@Module({
  imports: [ContainersModule],
  controllers: [SystemController, SystemEventsController],
  providers: [SystemService],
})
export class SystemModule {}
