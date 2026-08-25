import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type Docker from 'dockerode';
import { BehaviorSubject, Subject } from 'rxjs';
import type { DaemonEvent, DaemonEventType } from '@dockerlocal/shared';
import { DOCKER_CLIENT } from './docker.provider';

const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

const KNOWN_TYPES = new Set<DaemonEventType>([
  'container',
  'image',
  'volume',
  'network',
]);

interface RawDockerEvent {
  Type?: string;
  Action?: string;
  status?: string;
  id?: string;
  time?: number;
  Actor?: { ID?: string; Attributes?: Record<string, string> };
}

/**
 * Uma única conexão compartilhada com `docker.getEvents()` — nunca uma por
 * request. Cada controller SSE apenas se inscreve em `events$`.
 */
@Injectable()
export class DockerEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DockerEventsService.name);
  private stream: (NodeJS.ReadableStream & { destroy?: () => void }) | null =
    null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectDelay = RECONNECT_MIN_MS;
  private destroyed = false;

  readonly events$ = new Subject<DaemonEvent>();
  readonly connected$ = new BehaviorSubject<boolean>(false);

  constructor(@Inject(DOCKER_CLIENT) private readonly docker: Docker) {}

  onModuleInit(): void {
    void this.connect();
  }

  onModuleDestroy(): void {
    this.destroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.stream?.destroy?.();
  }

  private async connect(): Promise<void> {
    try {
      const stream = await this.docker.getEvents();
      this.stream = stream;
      this.connected$.next(true);
      this.reconnectDelay = RECONNECT_MIN_MS;

      stream.setEncoding('utf8');
      let buffer = '';

      stream.on('data', (chunk: string) => {
        buffer += chunk;
        let newlineIndex = buffer.indexOf('\n');
        while (newlineIndex >= 0) {
          const raw = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          if (raw.trim()) this.handleRaw(raw);
          newlineIndex = buffer.indexOf('\n');
        }
      });

      const onDisconnect = (): void => {
        if (this.stream !== stream) return;
        this.stream = null;
        this.connected$.next(false);
        this.scheduleReconnect();
      };

      stream.on('end', onDisconnect);
      stream.on('error', (err: Error) => {
        this.logger.warn(`Stream de eventos do daemon falhou: ${err.message}`);
        onDisconnect();
      });
    } catch (err) {
      this.logger.warn(
        `Não foi possível conectar ao stream de eventos: ${(err as Error).message}`,
      );
      this.connected$.next(false);
      this.scheduleReconnect();
    }
  }

  private handleRaw(raw: string): void {
    let parsed: RawDockerEvent;
    try {
      parsed = JSON.parse(raw) as RawDockerEvent;
    } catch {
      return;
    }

    const type = parsed.Type;
    if (!type || !KNOWN_TYPES.has(type as DaemonEventType)) return;

    const actor = parsed.Actor ?? {};
    const attrs = actor.Attributes ?? {};

    const event: DaemonEvent = {
      type: type as DaemonEventType,
      action: parsed.Action ?? parsed.status ?? 'unknown',
      id: actor.ID ?? parsed.id ?? '',
      name: attrs.name,
      project: attrs['com.docker.compose.project'],
      time: parsed.time ? parsed.time * 1000 : Date.now(),
    };

    this.events$.next(event);
  }

  private scheduleReconnect(): void {
    if (this.destroyed || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, RECONNECT_MAX_MS);
  }
}
