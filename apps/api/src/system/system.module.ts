import { Module } from '@nestjs/common';
import { ContainersModule } from '../containers/containers.module';
import { SystemController } from './system.controller';

@Module({
  imports: [ContainersModule],
  controllers: [SystemController],
})
export class SystemModule {}
