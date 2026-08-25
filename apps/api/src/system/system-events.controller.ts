import {
  Controller,
  MessageEvent,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { Observable, interval, merge } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import type { DaemonEventType } from '@dockerlocal/shared';
import { OriginGuard } from '../common/guards/origin.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { DockerEventsService } from '../docker/docker-events.service';
import {
  type SystemEventsQuery,
  systemEventsQuerySchema,
} from './dto/system-events-query.dto';

const HEARTBEAT_MS = 20_000;

@UseGuards(OriginGuard)
@Controller('system')
export class SystemEventsController {
  constructor(private readonly dockerEvents: DockerEventsService) {}

  @Sse('events/stream')
  stream(
    @Query(new ZodValidationPipe(systemEventsQuerySchema))
    query: SystemEventsQuery,
  ): Observable<MessageEvent> {
    const types = query.types
      ? new Set(
          query.types
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean) as DaemonEventType[],
        )
      : null;

    const connected$ = this.dockerEvents.connected$.pipe(
      map((connected) => ({ type: 'connection', data: { connected } })),
    );

    const events$ = this.dockerEvents.events$.pipe(
      filter((event) => !types || types.has(event.type)),
      map((event) => ({ type: 'event', data: event })),
    );

    const heartbeat$ = interval(HEARTBEAT_MS).pipe(
      map(() => ({ type: 'ping', data: {} })),
    );

    return merge(connected$, events$, heartbeat$);
  }
}
