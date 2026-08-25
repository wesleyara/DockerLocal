import type { VolumesListResult } from "@dockerlocal/shared";
import { http } from "./http";

export const volumesApi = {
  list: () => http.get<VolumesListResult>("/volumes"),

  remove: (name: string, opts: { force?: boolean } = {}) => {
    const query = new URLSearchParams();
    if (opts.force) query.set("force", "true");
    const qs = query.toString();
    return http.delete<{ ok: true }>(`/volumes/${name}${qs ? `?${qs}` : ""}`);
  },

  prune: (all = false) => http.post<unknown>("/volumes/prune", { all }),
};
