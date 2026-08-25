import { Provider } from '@nestjs/common';
import Docker from 'dockerode';
import { APP_CONFIG } from '../config/config.module';
import { AppConfig } from '../config/configuration';

export const DOCKER_CLIENT = Symbol('DOCKER_CLIENT');

export const dockerClientProvider: Provider = {
  provide: DOCKER_CLIENT,
  inject: [APP_CONFIG],
  useFactory: (config: AppConfig) =>
    new Docker({ socketPath: config.dockerSocket }),
};
