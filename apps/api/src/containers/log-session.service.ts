import { Inject, Injectable, Logger } from '@nestjs/common';
import { PassThrough } from 'node:stream';
import { ReplaySubject, Subject } from 'rxjs';
import type Docker from 'dockerode';
import type { LogEndEvent, LogLine, LogStream } from '@dockerlocal/shared';
import { DOCKER_CLIENT } from '../docker/docker.provider';
import { LineSplitter } from '../common/utils/line-splitter';
import { RingBuffer } from '../common/utils/ring-buffer';

const RING_CAP = 5_000;
const GRACE_MS = 30_000;
const MAX_SESSIONS = 20;
const SNAPSHOT_TAIL_DEFAULT = 500;

interface LogSession {
  containerId: string;
  raw: NodeJS.ReadableStream;
  lines$: Subject<LogLine>;
  end$: ReplaySubject<LogEndEvent>;
  buffer: RingBuffer<LogLine>;
  seq: number;
  refs: number;
  closeTimer: NodeJS.Timeout | null;
}

const TIMESTAMP_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z) (.*)$/;

function splitTimestamp(rawLine: string): { timestamp?: string; text: string } {
  // TTY output usa \r\n; o \r sobrevive ao split por \n e conta como
  // terminador de linha para `.`, então precisa sair antes do regex.
  const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
  const match = TIMESTAMP_RE.exec(line);
  if (match) {
    return { timestamp: match[1], text: match[2] };
  }
  return { text: line };
}

function demuxBuffer(buf: Buffer): { stream: LogStream; text: string }[] {
  const frames: { stream: LogStream; text: string }[] = [];
  let offset = 0;
  while (offset + 8 <= buf.length) {
    const streamType = buf.readUInt8(offset);
    const size = buf.readUInt32BE(offset + 4);
    const start = offset + 8;
    const end = start + size;
    if (end > buf.length) break;
    frames.push({
      stream: streamType === 2 ? 'stderr' : 'stdout',
      text: buf.subarray(start, end).toString('utf8'),
    });
    offset = end;
  }
  return frames;
}

function toLines(text: string): string[] {
  const parts = text.split('\n');
  if (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
  return parts;
}

@Injectable()
export class LogSessionService {
  private readonly logger = new Logger(LogSessionService.name);
  private readonly sessions = new Map<string, LogSession>();

  constructor(@Inject(DOCKER_CLIENT) private readonly docker: Docker) {}

  get activeCount(): number {
    return this.sessions.size;
  }

  async snapshot(containerId: string, tail = SNAPSHOT_TAIL_DEFAULT): Promise<LogLine[]> {
    const container = this.docker.getContainer(containerId);
    const info = await container.inspect();
    const hasTty = info.Config.Tty === true;

    const raw = (await container.logs({
      follow: false,
      stdout: true,
      stderr: true,
      tail,
      timestamps: true,
    })) as unknown as Buffer;

    const lines: LogLine[] = [];
    let seq = 0;

    if (hasTty) {
      for (const rawLine of toLines(raw.toString('utf8'))) {
        const { timestamp, text } = splitTimestamp(rawLine);
        lines.push({ seq: seq++, stream: 'stdout', text, timestamp });
      }
    } else {
      for (const frame of demuxBuffer(raw)) {
        for (const rawLine of toLines(frame.text)) {
          const { timestamp, text } = splitTimestamp(rawLine);
          lines.push({ seq: seq++, stream: frame.stream, text, timestamp });
        }
      }
    }

    return lines;
  }

  async subscribe(
    containerId: string,
    tail: number,
  ): Promise<{ session: LogSession; replay: LogLine[] }> {
    let session = this.sessions.get(containerId);

    if (!session) {
      session = await this.open(containerId);
    } else if (session.closeTimer) {
      clearTimeout(session.closeTimer);
      session.closeTimer = null;
    }

    session.refs += 1;
    const all = session.buffer.toArray();
    const replay = tail > 0 ? all.slice(Math.max(0, all.length - tail)) : all;
    return { session, replay };
  }

  release(containerId: string): void {
    const session = this.sessions.get(containerId);
    if (!session) return;

    session.refs = Math.max(0, session.refs - 1);
    if (session.refs === 0 && !session.closeTimer) {
      session.closeTimer = setTimeout(() => {
        this.destroy(containerId);
      }, GRACE_MS);
    }
  }

  private async open(containerId: string): Promise<LogSession> {
    if (this.sessions.size >= MAX_SESSIONS) {
      throw new Error(
        `Limite de ${MAX_SESSIONS} sessões de log simultâneas atingido — feche algum log aberto.`,
      );
    }

    const container = this.docker.getContainer(containerId);
    const info = await container.inspect();
    const hasTty = info.Config.Tty === true;

    const raw = (await container.logs({
      follow: true,
      stdout: true,
      stderr: true,
      tail: SNAPSHOT_TAIL_DEFAULT,
      timestamps: true,
    })) as unknown as NodeJS.ReadableStream;

    const session: LogSession = {
      containerId,
      raw,
      lines$: new Subject<LogLine>(),
      end$: new ReplaySubject<LogEndEvent>(1),
      buffer: new RingBuffer<LogLine>(RING_CAP),
      seq: 0,
      refs: 0,
      closeTimer: null,
    };

    const emit = (stream: LogStream, rawLine: string) => {
      const { timestamp, text } = splitTimestamp(rawLine);
      const line: LogLine = { seq: session.seq++, stream, text, timestamp };
      session.buffer.push(line);
      session.lines$.next(line);
    };

    const pipeChannel = (s: NodeJS.ReadableStream, chan: LogStream) => {
      s.setEncoding('utf8');
      s.pipe(new LineSplitter()).on('data', (line: string) => emit(chan, line));
    };

    if (hasTty) {
      pipeChannel(raw, 'stdout');
    } else {
      const out = new PassThrough();
      const err = new PassThrough();
      (container.modem as { demuxStream: (s: unknown, o: unknown, e: unknown) => void }).demuxStream(
        raw,
        out,
        err,
      );
      pipeChannel(out, 'stdout');
      pipeChannel(err, 'stderr');
    }

    raw.on('error', (err: Error) => {
      this.logger.warn(`Stream de log de ${containerId} falhou: ${err.message}`);
      session.end$.next({ reason: 'error', message: err.message });
      this.destroy(containerId);
    });

    raw.on('end', () => {
      void this.resolveEndReason(containerId).then((reason) => {
        session.end$.next({ reason });
        this.destroy(containerId);
      });
    });

    this.sessions.set(containerId, session);
    return session;
  }

  private async resolveEndReason(containerId: string): Promise<LogEndEvent['reason']> {
    try {
      await this.docker.getContainer(containerId).inspect();
      return 'container-stopped';
    } catch {
      return 'removed';
    }
  }

  private destroy(containerId: string): void {
    const session = this.sessions.get(containerId);
    if (!session) return;

    this.sessions.delete(containerId);
    if (session.closeTimer) clearTimeout(session.closeTimer);
    session.lines$.complete();

    const raw = session.raw as NodeJS.ReadableStream & { destroy?: () => void };
    raw.destroy?.();
  }
}
