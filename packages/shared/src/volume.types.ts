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
