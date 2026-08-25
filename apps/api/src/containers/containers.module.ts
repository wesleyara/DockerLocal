import { Module } from '@nestjs/common';
import { ContainersController } from './containers.controller';
import { ContainersService } from './containers.service';
import { LogsController } from './logs.controller';
import { LogSessionService } from './log-session.service';

@Module({
  controllers: [ContainersController, LogsController],
  providers: [ContainersService, LogSessionService],
  exports: [LogSessionService],
})
export class ContainersModule {}
