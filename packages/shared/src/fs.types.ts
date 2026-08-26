export interface FsRoot {
  label: string;
  path: string;
}

export interface FsEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isCompose: boolean;
  isDockerfile: boolean;
  size?: number;
  modifiedAt?: string;
}

export interface FsListResult {
  path: string;
  parent: string | null;
  entries: FsEntry[];
}

export type FsDetectKind = "compose" | "dockerfile" | "none";

export interface FsDetectResult {
  kind: FsDetectKind;
  composeFiles: string[];
  dockerfiles: string[];
}

export interface FsReadResult {
  path: string;
  content: string;
  truncated: boolean;
}
