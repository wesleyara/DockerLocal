import type {
  ComposeBuildBody,
  ComposeDownBody,
  ComposeServicesBody,
  ComposeUpBody,
  CreateStackFromFileBody,
  StackDetail,
  StackSummary,
} from "@dockerlocal/shared";
import { http } from "./http";

export const stacksApi = {
  list: () => http.get<StackSummary[]>("/stacks"),
  detail: (project: string) => http.get<StackDetail>(`/stacks/${project}`),
  config: (project: string) => http.get<unknown>(`/stacks/${project}/config`),

  fromFile: (body: CreateStackFromFileBody) =>
    http.post<{ taskId: string }>("/stacks/from-file", body),

  up: (project: string, body: ComposeUpBody = {}) =>
    http.post<{ taskId: string }>(`/stacks/${project}/up`, body),
  down: (project: string, body: ComposeDownBody = {}) =>
    http.post<{ taskId: string }>(`/stacks/${project}/down`, body),
  start: (project: string, body: ComposeServicesBody = {}) =>
    http.post<{ taskId: string }>(`/stacks/${project}/start`, body),
  stop: (project: string, body: ComposeServicesBody = {}) =>
    http.post<{ taskId: string }>(`/stacks/${project}/stop`, body),
  restart: (project: string, body: ComposeServicesBody = {}) =>
    http.post<{ taskId: string }>(`/stacks/${project}/restart`, body),
  pull: (project: string, body: ComposeServicesBody = {}) =>
    http.post<{ taskId: string }>(`/stacks/${project}/pull`, body),
  build: (project: string, body: ComposeBuildBody = {}) =>
    http.post<{ taskId: string }>(`/stacks/${project}/build`, body),

  selfRebuild: () => http.post<{ taskId: string }>("/stacks/self/rebuild"),

  removeFromRegistry: (project: string) =>
    http.delete<{ ok: boolean }>(`/stacks/${project}/registry`),
};
