import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ReplaySubject, Subject } from 'rxjs';
import type { Task, TaskLine, TaskStatus } from '@dockerlocal/shared';
import { RingBuffer } from '../common/utils/ring-buffer';

const RING_CAP = 5_000;
const FINISHED_TTL_MS = 60 * 60 * 1000;
const MAX_TASKS = 200;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

export interface TaskRecord {
  task: Task;
  buffer: RingBuffer<TaskLine>;
  lines$: Subject<TaskLine>;
  done$: ReplaySubject<Task>;
}

export interface TaskHandle {
  id: string;
  signal: AbortSignal;
  emit(stream: 'stdout' | 'stderr', text: string): void;
  succeed(meta?: Record<string, unknown>): void;
  fail(message: string): void;
}

@Injectable()
export class TaskRegistryService implements OnModuleDestroy {
  private readonly logger = new Logger(TaskRegistryService.name);
  private readonly tasks = new Map<
    string,
    TaskRecord & { seq: number; controller: AbortController }
  >();
  private readonly sweepTimer: NodeJS.Timeout;

  constructor() {
    this.sweepTimer = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
    this.sweepTimer.unref?.();
  }

  onModuleDestroy(): void {
    clearInterval(this.sweepTimer);
  }

  create(
    kind: string,
    label: string,
    meta?: Record<string, unknown>,
  ): TaskHandle {
    const id = randomUUID();
    const task: Task = {
      id,
      kind,
      label,
      status: 'running',
      startedAt: Date.now(),
      meta,
    };

    this.tasks.set(id, {
      task,
      buffer: new RingBuffer<TaskLine>(RING_CAP),
      lines$: new Subject<TaskLine>(),
      done$: new ReplaySubject<Task>(1),
      seq: 0,
      controller: new AbortController(),
    });
    this.enforceCap();

    return {
      id,
      signal: this.tasks.get(id)!.controller.signal,
      emit: (stream, text) => this.emit(id, stream, text),
      succeed: (m) => this.finish(id, 'succeeded', { meta: m }),
      fail: (message) => this.finish(id, 'failed', { message }),
    };
  }

  get(id: string): TaskRecord | undefined {
    return this.tasks.get(id);
  }

  list(opts: { active?: boolean } = {}): Task[] {
    const all = [...this.tasks.values()].map((r) => r.task);
    return opts.active ? all.filter((t) => t.status === 'running') : all;
  }

  cancel(id: string): void {
    const record = this.tasks.get(id);
    if (!record || record.task.status !== 'running') return;
    record.controller.abort();
    this.finish(id, 'cancelled', {});
  }

  remove(id: string): boolean {
    const record = this.tasks.get(id);
    if (!record || record.task.status === 'running') return false;
    this.tasks.delete(id);
    return true;
  }

  private emit(id: string, stream: 'stdout' | 'stderr', text: string): void {
    const record = this.tasks.get(id);
    if (!record) return;
    const line: TaskLine = { seq: record.seq++, stream, text };
    record.buffer.push(line);
    record.lines$.next(line);
  }

  private finish(
    id: string,
    status: TaskStatus,
    extra: { meta?: Record<string, unknown>; message?: string },
  ): void {
    const record = this.tasks.get(id);
    if (!record || record.task.status !== 'running') return;

    record.task.status = status;
    record.task.endedAt = Date.now();
    if (extra.message) record.task.message = extra.message;
    if (extra.meta) record.task.meta = { ...record.task.meta, ...extra.meta };

    record.lines$.complete();
    record.done$.next(record.task);
    record.done$.complete();
  }

  private enforceCap(): void {
    if (this.tasks.size <= MAX_TASKS) return;
    const finished = [...this.tasks.entries()]
      .filter(([, r]) => r.task.status !== 'running')
      .sort((a, b) => (a[1].task.endedAt ?? 0) - (b[1].task.endedAt ?? 0));
    while (this.tasks.size > MAX_TASKS && finished.length) {
      const [id] = finished.shift()!;
      this.tasks.delete(id);
    }
  }

  private sweep(): void {
    const now = Date.now();
    for (const [id, record] of this.tasks) {
      if (record.task.status === 'running') continue;
      if (record.task.endedAt && now - record.task.endedAt > FINISHED_TTL_MS) {
        this.tasks.delete(id);
      }
    }
  }
}
