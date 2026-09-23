export interface VolumeSummary {
  name: string;
  driver: string;
  mountpoint: string;
  createdAt?: string;
  labels: Record<string, string>;
  project?: string;
  /** Nomes dos containers (parados ou rodando) que montam este volume. */
  usedBy: string[];
  size?: number;
  isSelf: boolean;
}

export interface VolumesListResult {
  volumes: VolumeSummary[];
  warnings: string[];
}

export type VolumeFsEntryType = "file" | "directory" | "symlink" | "other";

export interface VolumeFsEntry {
  name: string;
  path: string;
  type: VolumeFsEntryType;
  size: number;
  modifiedAt: string;
  mode: string;
  uid: number;
  gid: number;
  linkTarget?: string;
}

export interface VolumeFsListResult {
  volume: string;
  path: string;
  parent: string | null;
  readOnly: boolean;
  entries: VolumeFsEntry[];
  truncated: boolean;
}

export interface VolumeFsReadResult {
  path: string;
  content: string;
  truncated: boolean;
  binary: boolean;
  size: number;
  mtime: string;
}
