import type { ContainerSummary } from "@dockerlocal/shared";
import { http } from "./http";

export interface ListContainersParams {
  all?: boolean;
  project?: string;
  status?: string;
}

export const containersApi = {
  list: (params: ListContainersParams = {}) => {
    const query = new URLSearchParams();
    if (params.all) query.set("all", "true");
    if (params.project) query.set("project", params.project);
    if (params.status) query.set("status", params.status);
    const qs = query.toString();
    return http.get<ContainerSummary[]>(`/containers${qs ? `?${qs}` : ""}`);
  },

  start: (id: string) => http.post<{ ok: true }>(`/containers/${id}/start`),
  stop: (id: string, t?: number) => http.post<{ ok: true }>(`/containers/${id}/stop`, { t }),
  restart: (id: string, t?: number) =>
    http.post<{ ok: true }>(`/containers/${id}/restart`, { t }),
  kill: (id: string, signal?: string) =>
    http.post<{ ok: true }>(`/containers/${id}/kill`, { signal }),
  pause: (id: string) => http.post<{ ok: true }>(`/containers/${id}/pause`),
  unpause: (id: string) => http.post<{ ok: true }>(`/containers/${id}/unpause`),
  rename: (id: string, name: string) =>
    http.post<{ ok: true }>(`/containers/${id}/rename`, { name }),

  remove: (id: string, opts: { force?: boolean; v?: boolean } = {}) => {
    const query = new URLSearchParams();
    if (opts.force) query.set("force", "true");
    if (opts.v) query.set("v", "true");
    const qs = query.toString();
    return http.delete<{ ok: true }>(`/containers/${id}${qs ? `?${qs}` : ""}`);
  },

  prune: () => http.post<unknown>("/containers/prune"),
};
