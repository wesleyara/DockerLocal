import { Inject, Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import type Docker from 'dockerode';
import type { Socket } from 'socket.io';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/configuration';
import { DOCKER_CLIENT } from '../docker/docker.provider';

const SAFE_HOSTS = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

// Testa bash antes de cair pro sh — imagens alpine não têm bash. `exec cmd
// || fallback` NÃO funciona pra isso: no busybox ash, quando o `exec`
// embutido não acha o binário ele mata o shell na hora com exit 127, sem
// nunca chegar no `||` (diferente do bash, onde `exec` que falha só
// retorna erro e segue o script). Testar com `-x` antes evita o problema.
const SHELL_CMD = [
  '/bin/sh',
  '-c',
  'if [ -x /bin/bash ]; then exec /bin/bash; else exec /bin/sh; fi',
];

interface ExecSession {
  stream: NodeJS.ReadWriteStream;
  exec: Docker.Exec;
}

/**
 * Único caso genuinamente bidirecional do app (ADR-04) — terminal exec
 * dentro de um container. `Tty: true` então o stream NÃO é multiplexado,
 * ao contrário dos logs.
 *
 * Mesmo modelo de ameaça do resto do app: validar Origin/Host aqui é
 * obrigatório, porque um WebSocket de um site malicioso não carrega o
 * header `X-DockerLocal` (a API de WebSocket do browser não permite
 * headers customizados) — só o Origin do handshake protege.
 */
@WebSocketGateway({ namespace: '/ws/exec' })
export class ExecGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ExecGateway.name);
  private readonly sessions = new Map<string, ExecSession>();

  constructor(
    @Inject(DOCKER_CLIENT) private readonly docker: Docker,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    if (!this.originAllowed(client)) {
      client.emit('error', 'Origin não permitida');
      client.disconnect(true);
      return;
    }

    const containerId = firstQueryValue(client.handshake.query.containerId);
    if (!containerId) {
      client.emit('error', 'containerId ausente');
      client.disconnect(true);
      return;
    }

    try {
      const container = this.docker.getContainer(containerId);
      const exec = await container.exec({
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
        Cmd: SHELL_CMD,
      });
      const stream = await exec.start({ hijack: true, stdin: true, Tty: true });

      this.sessions.set(client.id, { stream, exec });

      stream.on('data', (chunk: Buffer) => {
        client.emit('output', chunk.toString('utf8'));
      });
      stream.on('close', () => client.disconnect(true));
      stream.on('error', (err: Error) => {
        client.emit('error', err.message);
        client.disconnect(true);
      });

      client.emit('ready');
    } catch (err) {
      this.logger.warn(
        `Falha ao abrir exec em ${containerId}: ${err instanceof Error ? err.message : err}`,
      );
      client.emit('error', 'Não foi possível abrir o console do container');
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const session = this.sessions.get(client.id);
    if (!session) return;
    this.sessions.delete(client.id);
    session.stream.end();
    (session.stream as unknown as { destroy?: () => void }).destroy?.();
  }

  @SubscribeMessage('input')
  onInput(@ConnectedSocket() client: Socket, @MessageBody() data: string): void {
    this.sessions.get(client.id)?.stream.write(data);
  }

  @SubscribeMessage('resize')
  onResize(
    @ConnectedSocket() client: Socket,
    @MessageBody() dims: { cols: number; rows: number },
  ): void {
    const session = this.sessions.get(client.id);
    if (!session || !dims) return;
    session.exec.resize({ h: dims.rows, w: dims.cols }).catch(() => {
      // sessão pode já ter terminado — resize falhando não é fatal.
    });
  }

  private originAllowed(client: Socket): boolean {
    const host = client.handshake.headers.host;
    if (!host || !SAFE_HOSTS.test(host)) return false;

    const origin = client.handshake.headers.origin;
    if (origin && !this.config.allowedOrigins.includes(origin)) return false;

    return true;
  }
}

function firstQueryValue(v: unknown): string | undefined {
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && typeof v[0] === 'string') return v[0];
  return undefined;
}
