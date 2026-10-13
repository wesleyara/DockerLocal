export interface ImageSummary {
  id: string;
  shortId: string;
  parentId: string;
  repoTags: string[];
  dangling: boolean;
  size: number;
  createdAt: number;
  labels: Record<string, string>;
  containers: number;
  /** Nomes dos containers (parados ou rodando) que usam esta imagem. */
  usedBy: string[];
  isSelf: boolean;
}

export type ImageBuildEngine = "cli" | "api";

export interface BuildImageBody {
  contextPath: string;
  dockerfile: string;
  tags: string[];
  buildArgs?: Record<string, string>;
  noCache?: boolean;
  target?: string;
  engine?: ImageBuildEngine;
}

export type VulnerabilitySeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";

export interface ImageVulnerability {
  id: string;
  pkgName: string;
  installedVersion: string;
  fixedVersion?: string;
  severity: VulnerabilitySeverity;
  title?: string;
  primaryUrl?: string;
  /** Alvo do trivy: nome do pacote de SO ou path do lockfile (ex.: `app/package-lock.json`). */
  target: string;
}

export type ImageScanSummary = Record<VulnerabilitySeverity, number>;

export interface ImageScanPackage {
  name: string;
  version: string;
  target: string;
}

export interface ImageScanResult {
  imageRef: string;
  scannedAt: number;
  os?: string;
  trivyVersion: string;
  summary: ImageScanSummary;
  vulnerabilities: ImageVulnerability[];
  /** Pacotes identificados pelo trivy (`--list-all-pkgs`) sem nenhuma CVE conhecida. */
  cleanPackages: ImageScanPackage[];
}
