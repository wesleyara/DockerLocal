import { Module } from '@nestjs/common';
import { ContainersModule } from '../containers/containers.module';
import { SystemController } from './system.controller';
import { SystemEventsController } from './system-events.controller';

@Module({
  imports: [ContainersModule],
  controllers: [SystemController, SystemEventsController],
})
export class SystemModule {}
