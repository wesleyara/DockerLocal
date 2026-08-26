export type TaskStatus = "running" | "succeeded" | "failed" | "cancelled";

export interface TaskLineProgress {
  id: string;
  status: string;
  current?: number;
  total?: number;
}

export interface TaskLine {
  seq: number;
  stream: "stdout" | "stderr";
  text: string;
  /** Presente apenas em linhas de progresso por camada (ex.: pull de imagem). */
  progress?: TaskLineProgress;
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
