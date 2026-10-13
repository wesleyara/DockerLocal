import { Global, Module } from '@nestjs/common';
import { buildConfig } from './configuration';
import { validateEnv } from './env.schema';

export const APP_CONFIG = Symbol('APP_CONFIG');

@Global()
@Module({
  providers: [
    {
      provide: APP_CONFIG,
      useFactory: () => buildConfig(validateEnv(process.env)),
    },
  ],
  exports: [APP_CONFIG],
})
export class ConfigModule {}
