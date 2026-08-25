import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { access, constants } from 'node:fs/promises';
import type Docker from 'dockerode';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/configuration';
import { DOCKER_CLIENT } from './docker.provider';

export interface PingResult {
  ok: boolean;
  apiVersion: string;
  engineVersion: string;
}

@Injectable()
export class DockerService implements OnModuleInit {
  private readonly logger = new Logger(DockerService.name);

  constructor(
    @Inject(DOCKER_CLIENT) private readonly docker: Docker,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await access(this.config.dockerSocket, constants.R_OK | constants.W_OK);
    } catch {
      throw new Error(
        `Sem permissão no socket ${this.config.dockerSocket} — verifique DOCKER_GID. ` +
          'Rode `getent group docker | cut -d: -f3` e confirme que seu usuário pertence a esse grupo.',
      );
    }

    try {
      await this.docker.ping();
    } catch (err) {
      this.logger.error(
        `Não foi possível conectar ao daemon Docker: ${(err as Error).message}`,
      );
    }
  }

  async ping(): Promise<PingResult> {
    await this.docker.ping();
    const version = await this.docker.version();
    return {
      ok: true,
      apiVersion: version.ApiVersion,
      engineVersion: version.Version,
    };
  }

  async version(): Promise<Docker.DockerVersion> {
    return this.docker.version();
  }

  async info(): Promise<unknown> {
    return this.docker.info();
  }

  getClient(): Docker {
    return this.docker;
  }
}
