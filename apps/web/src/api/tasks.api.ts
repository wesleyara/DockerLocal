import type { Task } from "@dockerlocal/shared";
import { http } from "./http";

export const tasksApi = {
  list: (active = false) => http.get<Task[]>(`/tasks${active ? "?active=true" : ""}`),
  get: (id: string) => http.get<Task>(`/tasks/${id}`),
  cancel: (id: string) => http.post<{ ok: true }>(`/tasks/${id}/cancel`),
  remove: (id: string) => http.delete<{ ok: boolean }>(`/tasks/${id}`),
};
