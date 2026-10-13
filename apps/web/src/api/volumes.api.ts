import type {
  VolumeFsListResult,
  VolumeFsReadResult,
  VolumesListResult,
} from "@dockerlocal/shared";
import { ApiError, BASE_URL, http, type ApiErrorPayload } from "./http";

export const volumesApi = {
  list: () => http.get<VolumesListResult>("/volumes"),

  remove: (name: string, opts: { force?: boolean } = {}) => {
    const query = new URLSearchParams();
    if (opts.force) query.set("force", "true");
    const qs = query.toString();
    return http.delete<{ ok: true }>(`/volumes/${name}${qs ? `?${qs}` : ""}`);
  },

  prune: (all = false) => http.post<unknown>("/volumes/prune", { all }),

  listFiles: (name: string, path: string) =>
    http.get<VolumeFsListResult>(`/volumes/${encodeURIComponent(name)}/files?path=${encodeURIComponent(path)}`),

  readFile: (name: string, path: string) =>
    http.get<VolumeFsReadResult>(
      `/volumes/${encodeURIComponent(name)}/files/read?path=${encodeURIComponent(path)}`,
    ),

  downloadUrl: (name: string, path: string) =>
    `${BASE_URL}/volumes/${encodeURIComponent(name)}/files/download?path=${encodeURIComponent(path)}`,

  mkdir: (name: string, path: string) =>
    http.post<{ ok: true }>(`/volumes/${encodeURIComponent(name)}/files/mkdir`, { path }),

  rename: (name: string, from: string, to: string) =>
    http.post<{ ok: true }>(`/volumes/${encodeURIComponent(name)}/files/rename`, { from, to }),

  removeFile: (name: string, path: string) =>
    http.delete<{ ok: true }>(`/volumes/${encodeURIComponent(name)}/files?path=${encodeURIComponent(path)}`),

  /**
   * XMLHttpRequest em vez de `fetch`: é o único jeito nativo de saber o
   * progresso de UPLOAD (fetch só expõe progresso de download).
   */
  upload: (
    name: string,
    path: string,
    file: File | Blob,
    opts: { overwrite?: boolean; expectedMtime?: string; onProgress?: (pct: number) => void } = {},
  ): Promise<void> => {
    const query = new URLSearchParams({ path });
    if (opts.overwrite) query.set("overwrite", "true");
    if (opts.expectedMtime) query.set("expectedMtime", opts.expectedMtime);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", `${BASE_URL}/volumes/${encodeURIComponent(name)}/files?${query.toString()}`);
      xhr.setRequestHeader("X-DockerLocal", "1");
      xhr.setRequestHeader("Content-Type", "application/octet-stream");

      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable && opts.onProgress) {
          opts.onProgress(Math.round((evt.loaded / evt.total) * 100));
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
          return;
        }
        let payload: ApiErrorPayload;
        try {
          payload = JSON.parse(xhr.responseText);
        } catch {
          payload = { statusCode: xhr.status, message: xhr.statusText };
        }
        reject(new ApiError(payload));
      };
      xhr.onerror = () => reject(new Error("Falha de rede no upload"));

      xhr.send(file);
    });
  },
};
