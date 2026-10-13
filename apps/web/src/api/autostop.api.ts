import type { AutostopLastRun, AutostopState } from "@dockerlocal/shared";
import { http } from "./http";

const q = (name: string) => new URLSearchParams({ name }).toString();

export const autostopApi = {
  get: () => http.get<AutostopState>("/autostop"),
  setEnabled: (enabled: boolean) => http.post<AutostopState>("/autostop/enabled", { enabled }),
  add: (name: string) => http.post<AutostopState>("/autostop/excluded", { name }),
  remove: (name: string) => http.delete<AutostopState>(`/autostop/excluded?${q(name)}`),
  run: () => http.post<AutostopLastRun>("/autostop/run"),
};
