import type { ImageSummary } from "@dockerlocal/shared";
import { http } from "./http";

export interface ListImagesParams {
  all?: boolean;
  dangling?: boolean;
}

export const imagesApi = {
  list: (params: ListImagesParams = {}) => {
    const query = new URLSearchParams();
    if (params.all) query.set("all", "true");
    if (params.dangling) query.set("dangling", "true");
    const qs = query.toString();
    return http.get<ImageSummary[]>(`/images${qs ? `?${qs}` : ""}`);
  },

  tag: (id: string, repo: string, tag?: string) =>
    http.post<{ ok: true }>(`/images/${id}/tag`, { repo, tag }),

  remove: (id: string, opts: { force?: boolean; noprune?: boolean } = {}) => {
    const query = new URLSearchParams();
    if (opts.force) query.set("force", "true");
    if (opts.noprune) query.set("noprune", "true");
    const qs = query.toString();
    return http.delete<unknown>(`/images/${id}${qs ? `?${qs}` : ""}`);
  },

  prune: (danglingOnly = true) => http.post<unknown>("/images/prune", { danglingOnly }),

  pull: (ref: string) => http.post<{ taskId: string }>("/images/pull", { ref }),
};
