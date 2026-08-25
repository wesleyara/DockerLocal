export type ContainerState =
  | "running"
  | "exited"
  | "created"
  | "paused"
  | "restarting"
  | "dead";

export interface ContainerPort {
  ip?: string;
  private: number;
  public?: number;
  type: string;
}

export interface ContainerCompose {
  project: string;
  service: string;
  containerNumber: number;
  configFiles: string[];
  workingDir: string;
}

export interface ContainerSummary {
  id: string;
  shortId: string;
  name: string;
  names: string[];
  image: string;
  imageId: string;
  command: string;
  state: ContainerState;
  status: string;
  createdAt: number;
  ports: ContainerPort[];
  labels: Record<string, string>;
  compose?: ContainerCompose;
  isSelf: boolean;
}
