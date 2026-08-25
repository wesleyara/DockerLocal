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
