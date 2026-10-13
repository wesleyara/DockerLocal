import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import type { Response } from 'express';

interface DockerodeError extends Error {
  statusCode?: number;
  json?: { message?: string };
}

@Catch()
export class DockerExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      res.status(exception.getStatus()).json(exception.getResponse());
      return;
    }

    const err = exception as DockerodeError;
    const statusCode = err?.statusCode;

    if (statusCode === 404) {
      res.status(404).json({
        statusCode: 404,
        message: 'não encontrado (já foi removido?)',
      });
      return;
    }

    if (statusCode === 409) {
      res.status(409).json({
        statusCode: 409,
        message:
          err?.json?.message ??
          err?.message ??
          'conflito ao executar a operação',
        canForce: true,
      });
      return;
    }

    res.status(500).json({
      statusCode: 500,
      message: err?.message ?? 'erro interno',
    });
  }
}
