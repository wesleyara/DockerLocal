import { homedir } from 'node:os';
import { join } from 'node:path';
import { Env } from './env.schema';

export interface AppConfig {
  port: number;
  host: string;
  dockerSocket: string;
  fsRoots: string[];
  authToken?: string;
  allowedOrigins: string[];
  dataDir: string;
}

export function buildConfig(env: Env): AppConfig {
  return {
    port: env.PORT,
    host: env.HOST,
    dockerSocket: env.DOCKER_SOCKET,
    fsRoots: env.FS_ROOTS.split(',')
      .map((r) => r.trim())
      .filter(Boolean),
    authToken: env.AUTH_TOKEN,
    allowedOrigins: env.ALLOWED_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    dataDir:
      env.DATA_DIR ??
      (env.DOCKER_LOCAL_CONTAINER ? '/data' : join(homedir(), '.dockerlocal')),
  };
}
