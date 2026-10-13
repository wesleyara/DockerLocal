import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { APP_CONFIG } from '../../config/config.module';
import type { AppConfig } from '../../config/configuration';

const SAFE_HOSTS = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

@Injectable()
export class OriginGuard implements CanActivate {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();

    const host = req.headers.host;
    if (!host || !SAFE_HOSTS.test(host)) {
      throw new ForbiddenException('Host não permitido');
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      return true;
    }

    const marker = req.headers['x-dockerlocal'];
    if (marker !== '1') {
      throw new ForbiddenException('Header X-DockerLocal ausente');
    }

    const origin = req.headers.origin;
    if (origin && !this.config.allowedOrigins.includes(origin)) {
      throw new ForbiddenException('Origin não permitida');
    }

    return true;
  }
}
