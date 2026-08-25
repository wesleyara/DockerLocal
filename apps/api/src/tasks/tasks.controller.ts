import {
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  MessageEvent,
  NotFoundException,
  Param,
  Post,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { Observable, concat, from, interval, merge, of } from 'rxjs';
import { map, take } from 'rxjs/operators';
import type { Task } from '@dockerlocal/shared';
import { OriginGuard } from '../common/guards/origin.guard';
import { TaskRegistryService } from './task-registry.service';

const HEARTBEAT_MS = 20_000;

@UseGuards(OriginGuard)
@Controller('tasks')
export class TasksController {
  constructor(private readonly registry: TaskRegistryService) {}

  @Get()
  list(@Query('active') active?: string): Task[] {
    return this.registry.list({ active: active === 'true' });
  }

  @Get(':id')
  getOne(@Param('id') id: string): Task {
    const record = this.registry.get(id);
    if (!record) throw new NotFoundException('Task não encontrada');
    return record.task;
  }

  @Sse(':id/stream')
  stream(
    @Param('id') id: string,
    @Headers('last-event-id') lastEventId?: string,
  ): Observable<MessageEvent> {
    const record = this.registry.get(id);
    if (!record) throw new NotFoundException('Task não encontrada');

    const startSeq = lastEventId ? Number(lastEventId) + 1 : 0;
    const replay = record.buffer.toArray().filter((l) => l.seq >= startSeq);
    const replay$ = from(
      replay.map((line): MessageEvent => ({
        id: String(line.seq),
        type: 'line',
        data: line,
      })),
    );

    if (record.task.status !== 'running') {
      return concat(
        replay$,
        of<MessageEvent>({ type: 'task-end', data: record.task }),
      );
    }

    const live$ = record.lines$.pipe(
      map((line): MessageEvent => ({
        id: String(line.seq),
        type: 'line',
        data: line,
      })),
    );

    const taskEnd$ = record.done$.pipe(
      take(1),
      map((task): MessageEvent => ({ type: 'task-end', data: task })),
    );

    const heartbeat$ = interval(HEARTBEAT_MS).pipe(
      map((): MessageEvent => ({ type: 'ping', data: {} })),
    );

    return concat(replay$, merge(live$, taskEnd$, heartbeat$));
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@Param('id') id: string): { ok: true } {
    this.registry.cancel(id);
    return { ok: true };
  }

  @Delete(':id')
  remove(@Param('id') id: string): { ok: boolean } {
    return { ok: this.registry.remove(id) };
  }
}
