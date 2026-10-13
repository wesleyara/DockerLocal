import { Module } from '@nestjs/common';
import { ExecGateway } from './exec.gateway';

@Module({
  providers: [ExecGateway],
})
export class ExecModule {}
