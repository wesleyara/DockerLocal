import { Controller, Get, MessageEvent, Param, Query, Sse, UseGuards } from '@nestjs/common';
import { Observable, concat, from, interval, merge, of } from 'rxjs';
import { bufferTime, filter, finalize, map, switchMap, take } from 'rxjs/operators';
import type { LogLine } from '@dockerlocal/shared';
import { OriginGuard } from '../common/guards/origin.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { LogSessionService } from './log-session.service';
import { type LogQuery, logQuerySchema } from './dto/log-query.dto';

const HEARTBEAT_MS = 20_000;

@UseGuards(OriginGuard)
@Controller('containers')
export class LogsController {
  constructor(private readonly sessions: LogSessionService) {}

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
          map((lines) => ({ type: 'logs', data: { lines, dropped: 0 } }) as MessageEvent),
        );

        const end$ = session.end$.pipe(
          take(1),
          map((ev) => ({ type: 'log-end', data: ev }) as MessageEvent),
        );

        const heartbeat$ = interval(HEARTBEAT_MS).pipe(
          map(() => ({ type: 'ping', data: {} }) as MessageEvent),
        );

        return concat(replay$, merge(live$, end$, heartbeat$)).pipe(
          finalize(() => this.sessions.release(id)),
        );
      }),
    );
  }
}
