export type DaemonEventType = "container" | "image" | "volume" | "network";

export interface DaemonEvent {
  type: DaemonEventType;
  action: string;
  id: string;
  name?: string;
  project?: string;
  time: number;
}

export interface DaemonConnectionEvent {
  connected: boolean;
}
