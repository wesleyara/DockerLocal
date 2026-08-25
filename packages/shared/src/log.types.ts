export type LogStream = "stdout" | "stderr";

export interface LogLine {
  seq: number;
  stream: LogStream;
  text: string;
  timestamp?: string;
}

export interface LogBatchEvent {
  lines: LogLine[];
  dropped: number;
}

export type LogEndReason = "container-stopped" | "removed" | "error";

export interface LogEndEvent {
  reason: LogEndReason;
  message?: string;
}
