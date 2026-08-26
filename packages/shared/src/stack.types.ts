import type { ContainerSummary } from "./container.types";

export type StackStatus = "running" | "partial" | "stopped";
export type StackSource = "discovered" | "registry";

export interface StackSummary {
  project: string;
  status: StackStatus;
  source: StackSource;
  workingDir: string;
  configFiles: string[];
  fileExists: boolean;
  serviceCount: number;
  containerCount: number;
  runningCount: number;
}

export interface StackService {
  name: string;
  containers: ContainerSummary[];
}

export interface StackDetail extends StackSummary {
  services: StackService[];
  volumes: string[];
  networks: string[];
}

export type ComposePullPolicy = "always" | "missing" | "never";

export interface ComposeUpBody {
  services?: string[];
  build?: boolean;
  forceRecreate?: boolean;
  pull?: ComposePullPolicy;
}

export interface ComposeDownBody {
  volumes?: boolean;
  rmi?: "local" | "all";
}

export interface ComposeBuildBody {
  services?: string[];
  noCache?: boolean;
}

export interface ComposeServicesBody {
  services?: string[];
}

export interface CreateStackFromFileBody {
  composeFilePath: string;
  projectName?: string;
  envFile?: string;
  up?: boolean;
}

export interface StackLogLine {
  seq: number;
  service: string;
  stream: "stdout" | "stderr";
  text: string;
  timestamp?: string;
}
