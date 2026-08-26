export interface FsRoot {
  label: string;
  path: string;
  /** Raiz vinda do .env (FS_ROOTS), fixa — só as `source: "runtime"` podem ser removidas pela UI. */
  source: "env" | "runtime";
}

export interface AddFsRootBody {
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
