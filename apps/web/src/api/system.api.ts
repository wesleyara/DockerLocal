import { http } from "./http";

export interface PingResult {
  ok: boolean;
  apiVersion: string;
  engineVersion: string;
}

export const systemApi = {
  ping: () => http.get<PingResult>("/system/ping"),
};
