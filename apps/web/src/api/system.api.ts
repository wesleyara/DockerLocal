import type { PruneTarget, SystemDiskUsage, SystemPruneResult } from "@dockerlocal/shared";
import { http } from "./http";

export interface PingResult {
  ok: boolean;
  apiVersion: string;
  engineVersion: string;
}

export interface PruneSystemOptions {
  imagesAll?: boolean;
  volumesAll?: boolean;
}

export const systemApi = {
  ping: () => http.get<PingResult>("/system/ping"),

  diskUsage: () => http.get<SystemDiskUsage>("/system/disk-usage"),

  prune: (targets: PruneTarget[], opts: PruneSystemOptions = {}) =>
    http.post<SystemPruneResult>("/system/prune", {
      targets,
      imagesAll: opts.imagesAll ?? false,
      volumesAll: opts.volumesAll ?? false,
    }),
};
