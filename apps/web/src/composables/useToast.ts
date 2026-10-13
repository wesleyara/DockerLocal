import { reactive } from "vue";

export type ToastKind = "success" | "error" | "info";

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

const toasts = reactive<Toast[]>([]);
let nextId = 1;

const DEFAULT_DURATION_MS = 4000;

export function useToast() {
  function push(kind: ToastKind, message: string, durationMs = DEFAULT_DURATION_MS): void {
    const id = nextId++;
    toasts.push({ id, kind, message });
    setTimeout(() => dismiss(id), durationMs);
  }

  function dismiss(id: number): void {
    const index = toasts.findIndex((t) => t.id === id);
    if (index !== -1) toasts.splice(index, 1);
  }

  return {
    toasts,
    success: (message: string) => push("success", message),
    error: (message: string) => push("error", message),
    info: (message: string) => push("info", message),
    dismiss,
  };
}
