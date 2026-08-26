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
