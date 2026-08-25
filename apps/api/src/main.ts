import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { DockerExceptionFilter } from './common/filters/docker-exception.filter';
import { buildConfig } from './config/configuration';
import { validateEnv } from './config/env.schema';

function findEnvFile(startDir: string): string | null {
  let dir = startDir;
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

async function bootstrap() {
  const envFile = findEnvFile(process.cwd());
  if (envFile) {
    process.loadEnvFile(envFile);
  }

  const config = buildConfig(validateEnv(process.env));

  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new DockerExceptionFilter());

  await app.listen(config.port, config.host);

  Logger.log(
    `DockerLocal API em http://${config.host}:${config.port}/api`,
    'Bootstrap',
  );
}

void bootstrap();
