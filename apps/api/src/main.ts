import { existsSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';
import { DockerExceptionFilter } from './common/filters/docker-exception.filter';
import { buildConfig } from './config/configuration';
import { validateEnv } from './config/env.schema';
import { WEB_ASSETS } from './static/web-assets.generated';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

function contentTypeFor(path: string): string {
  return CONTENT_TYPES[extname(path)] ?? 'application/octet-stream';
}

/**
 * Serve o build do web na mesma origem da API — front e API no mesmo
 * `127.0.0.1:5100`, sem CORS. Em dev (`pnpm dev`) o Vite serve o front e
 * faz proxy pra `/api`, então nada aqui se aplica.
 *
 * Dois caminhos: o binário standalone (fase 9) tem `WEB_ASSETS` preenchido
 * pelo esbuild em build time e serve tudo da memória, sem nenhum arquivo
 * externo — Docker e o pacote npm normal caem no disco (`apps/web/dist`).
 */
function setupStatic(app: NestExpressApplication): void {
  if (Object.keys(WEB_ASSETS).length > 0) {
    setupEmbeddedStatic(app);
    return;
  }
  setupDiskStatic(app);
}

function setupEmbeddedStatic(app: NestExpressApplication): void {
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (
      (req.method !== 'GET' && req.method !== 'HEAD') ||
      req.path.startsWith('/api')
    ) {
      next();
      return;
    }
    const key = req.path === '/' ? 'index.html' : req.path.replace(/^\//, '');
    const resolvedKey = key in WEB_ASSETS ? key : 'index.html';
    const data = WEB_ASSETS[resolvedKey];
    res.setHeader('Content-Type', contentTypeFor(resolvedKey));
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    res.send(Buffer.from(data, 'base64'));
  });

  Logger.log(
    `Servindo o front embutido no binário (${Object.keys(WEB_ASSETS).length} arquivos)`,
    'Bootstrap',
  );
}

function setupDiskStatic(app: NestExpressApplication): void {
  const webDist = resolve(
    process.env.WEB_DIST_PATH ?? join(process.cwd(), 'apps/web/dist'),
  );
  const indexHtml = join(webDist, 'index.html');
  if (!existsSync(indexHtml)) return;

  app.useStaticAssets(webDist);
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) {
      next();
      return;
    }
    res.sendFile(indexHtml);
  });

  Logger.log(`Servindo o front de ${webDist}`, 'Bootstrap');
}

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
  // No binário standalone o usuário roda de qualquer diretório (duplo
  // clique, atalho, etc.) — sem isso, `.env` só é achado se o cwd por
  // acaso estiver perto dele. Tenta subir a partir do cwd primeiro (mais
  // específico); cai pro lado do executável só se nada bater.
  const isStandaloneBinary = Object.keys(WEB_ASSETS).length > 0;
  const envFile =
    findEnvFile(process.cwd()) ??
    (isStandaloneBinary ? findEnvFile(dirname(process.execPath)) : null);
  if (envFile) {
    process.loadEnvFile(envFile);
  }

  const config = buildConfig(validateEnv(process.env));

  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new DockerExceptionFilter());
  setupStatic(app);

  await app.listen(config.port, config.host);

  Logger.log(
    `DockerLocal API em http://${config.host}:${config.port}/api`,
    'Bootstrap',
  );
}

void bootstrap();
