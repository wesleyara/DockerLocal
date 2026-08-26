import type { FsDetectResult, FsListResult, FsReadResult, FsRoot } from "@dockerlocal/shared";
import { http } from "./http";

export const fsApi = {
  roots: () => http.get<FsRoot[]>("/fs/roots"),

  list: (path: string, showHidden = false) => {
    const query = new URLSearchParams({ path });
    if (showHidden) query.set("showHidden", "true");
    return http.get<FsListResult>(`/fs/list?${query.toString()}`);
  },

  detect: (path: string) =>
    http.get<FsDetectResult>(`/fs/detect?${new URLSearchParams({ path }).toString()}`),

  read: (path: string) =>
    http.get<FsReadResult>(`/fs/read?${new URLSearchParams({ path }).toString()}`),
};
