export type TaskStatus = "running" | "succeeded" | "failed" | "cancelled";

export interface TaskLine {
  seq: number;
  stream: "stdout" | "stderr";
  text: string;
}

export interface Task {
  id: string;
  kind: string;
  label: string;
  status: TaskStatus;
  startedAt: number;
  endedAt?: number;
  message?: string;
  meta?: Record<string, unknown>;
}
