export type LogStream = "stdout" | "stderr";

export interface LogLine {
  seq: number;
  stream: LogStream;
  text: string;
  timestamp?: string;
  /** Presente só no stream agregado de múltiplos containers. */
  containerId?: string;
}

export interface LogBatchEvent {
  lines: LogLine[];
  dropped: number;
}

export type LogEndReason = "container-stopped" | "removed" | "error";

export interface LogEndEvent {
  reason: LogEndReason;
  message?: string;
  /** Presente só no stream agregado — identifica qual container encerrou. */
  containerId?: string;
}
