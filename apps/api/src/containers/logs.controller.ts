import {
  Controller,
  Get,
  MessageEvent,
  Param,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { EMPTY, Observable, concat, from, interval, merge, of } from 'rxjs';
import {
  bufferTime,
  filter,
  finalize,
  map,
  switchMap,
  take,
} from 'rxjs/operators';
import type { LogLine } from '@dockerlocal/shared';
import { OriginGuard } from '../common/guards/origin.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { LogSession, LogSessionService } from './log-session.service';
import { type LogQuery, logQuerySchema } from './dto/log-query.dto';
import {
  type GroupLogQuery,
  groupLogQuerySchema,
} from './dto/group-log-query.dto';

const HEARTBEAT_MS = 20_000;

interface SubscribedSession {
  id: string;
  session: LogSession;
  replay: LogLine[];
}

@UseGuards(OriginGuard)
@Controller('containers')
export class LogsController {
  constructor(private readonly sessions: LogSessionService) {}

  /**
   * Stream agregado de vários containers num único SSE — o teto de 3
   * conexões simultâneas por aba proíbe abrir um EventSource por container.
   */
  @Sse('logs/stream')
  groupStream(
    @Query(new ZodValidationPipe(groupLogQuerySchema)) query: GroupLogQuery,
  ): Observable<MessageEvent> {
    const ids = [
      ...new Set(
        query.ids
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    ];
    const tail = query.tail ?? 100;

    return from(
      Promise.allSettled(
        ids.map((id): Promise<SubscribedSession> =>
          this.sessions
            .subscribe(id, tail)
            .then(({ session, replay }) => ({ id, session, replay })),
        ),
      ),
    ).pipe(
      switchMap((settled) => {
        const ok = settled
          .filter(
            (r): r is PromiseFulfilledResult<SubscribedSession> =>
              r.status === 'fulfilled',
          )
          .map((r) => r.value);
        const failedIds = ids.filter((id) => !ok.some((r) => r.id === id));

        const replayLines = ok
          .flatMap((r) =>
            r.replay.map((line) => ({ ...line, containerId: r.id })),
          )
          .sort(
            (a, b) =>
              (a.timestamp ?? '').localeCompare(b.timestamp ?? '') ||
              a.seq - b.seq,
          );

        const replay$ = of<MessageEvent>({
          type: 'logs',
          data: { lines: replayLines, dropped: 0 },
        });

        const failed$ = from(failedIds).pipe(
          map((id) => ({
            type: 'log-end',
            data: { reason: 'error', containerId: id },
          })),
        );

        const live$ = ok.length
          ? merge(
              ...ok.map((r) =>
                r.session.lines$.pipe(
                  map((line) => ({ ...line, containerId: r.id })),
                ),
              ),
            ).pipe(
              bufferTime(100),
              filter((lines) => lines.length > 0),
              map((lines) => ({
                type: 'logs',
                data: { lines, dropped: 0 },
              })),
            )
          : EMPTY;

        const end$ = ok.length
          ? merge(
              ...ok.map((r) =>
                r.session.end$.pipe(
                  take(1),
                  map((ev) => ({
                    type: 'log-end',
                    data: { ...ev, containerId: r.id },
                  })),
                ),
              ),
            )
          : EMPTY;

        const heartbeat$ = interval(HEARTBEAT_MS).pipe(
          map(() => ({ type: 'ping', data: {} })),
        );

        return concat(replay$, failed$, merge(live$, end$, heartbeat$)).pipe(
          finalize(() => {
            for (const r of ok) this.sessions.release(r.id);
          }),
        );
      }),
    );
  }

  @Get(':id/logs')
  async snapshot(
    @Param('id') id: string,
    @Query(new ZodValidationPipe(logQuerySchema)) query: LogQuery,
  ): Promise<LogLine[]> {
    return this.sessions.snapshot(id, query.tail);
  }

  @Sse(':id/logs/stream')
  stream(
    @Param('id') id: string,
    @Query(new ZodValidationPipe(logQuerySchema)) query: LogQuery,
  ): Observable<MessageEvent> {
    const tail = query.tail ?? 100;

    return from(this.sessions.subscribe(id, tail)).pipe(
      switchMap(({ session, replay }) => {
        const replay$ = of<MessageEvent>({
          type: 'logs',
          data: { lines: replay, dropped: 0 },
        });

        const live$ = session.lines$.pipe(
          bufferTime(100),
          filter((lines) => lines.length > 0),
          map((lines) => ({ type: 'logs', data: { lines, dropped: 0 } })),
        );

        const end$ = session.end$.pipe(
          take(1),
          map((ev) => ({ type: 'log-end', data: ev })),
        );

        const heartbeat$ = interval(HEARTBEAT_MS).pipe(
          map(() => ({ type: 'ping', data: {} })),
        );

        return concat(replay$, merge(live$, end$, heartbeat$)).pipe(
          finalize(() => this.sessions.release(id)),
        );
      }),
    );
  }
}
