import { Module } from '@nestjs/common';
import { AutostopConfigService } from './autostop-config.service';
import { AutostopController } from './autostop.controller';
import { AutostopService } from './autostop.service';

@Module({
  controllers: [AutostopController],
  providers: [AutostopConfigService, AutostopService],
})
export class AutostopModule {}
