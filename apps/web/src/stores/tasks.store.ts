import { computed, reactive, ref } from "vue";
import { defineStore } from "pinia";
import type { Task, TaskLine } from "@dockerlocal/shared";
import { tasksApi } from "@/api/tasks.api";
import { createSseClient } from "@/api/sse";
import { useToast } from "@/composables/useToast";
import { useImagesStore } from "./images.store";
import { useStacksStore } from "./stacks.store";

const MAX_LINES = 10_000;

export const useTasksStore = defineStore("tasks", () => {
  const tasks = reactive(new Map<string, Task>());
  // Linhas em `reactive`, mas o EventSource fica fora — colocar um EventSource
  // dentro de um Map reativo faz o Vue tentar proxy-ar o objeto e quebra.
  const linesByTask = reactive(new Map<string, TaskLine[]>());
  const channels = new Map<string, EventSource>();

  const selectedId = ref<string | null>(null);
  const drawerOpen = ref(false);

  const toast = useToast();

  const activeCount = computed(
    () => [...tasks.values()].filter((t) => t.status === "running").length,
  );

  function linesFor(id: string): TaskLine[] {
    return linesByTask.get(id) ?? [];
  }

  /** Reabre o acompanhamento das tasks ativas após F5 — a saída completa
   * volta pelo replay do buffer, sem `Last-Event-ID` (nova conexão). */
  async function restoreActive(): Promise<void> {
    try {
      const active = await tasksApi.list(true);
      for (const task of active) {
        tasks.set(task.id, task);
        watchTask(task.id);
      }
    } catch {
      // best-effort — indisponibilidade do backend não deve travar o app
    }
  }

  function track(task: Task): void {
    tasks.set(task.id, task);
    watchTask(task.id);
  }

  function watchTask(id: string): void {
    if (channels.has(id)) return;

    const es = createSseClient(`/tasks/${id}/stream`);
    channels.set(id, es);
    if (!linesByTask.has(id)) linesByTask.set(id, []);

    es.addEventListener("line", (e: MessageEvent) => {
      const line = JSON.parse(e.data) as TaskLine;
      const merged = (linesByTask.get(id) ?? []).concat(line);
      linesByTask.set(
        id,
        merged.length > MAX_LINES ? merged.slice(merged.length - MAX_LINES) : merged,
      );
    });

    es.addEventListener("task-end", (e: MessageEvent) => {
      const task = JSON.parse(e.data) as Task;
      tasks.set(task.id, task);
      es.close();
      channels.delete(id);
      onFinished(task);
    });
  }

  function onFinished(task: Task): void {
    if (task.status === "succeeded") {
      toast.success(`${task.label} concluída.`);
      if (task.kind === "image-pull") void useImagesStore().fetch(true);
      if (task.kind.startsWith("compose-")) void useStacksStore().fetch(true);
    } else if (task.status === "failed") {
      toast.error(task.message ?? `${task.label} falhou.`);
    } else if (task.status === "cancelled") {
      toast.info(`${task.label} cancelada.`);
    }
  }

  function open(id: string): void {
    selectedId.value = id;
    drawerOpen.value = true;
  }

  function close(): void {
    drawerOpen.value = false;
  }

  async function cancel(id: string): Promise<void> {
    await tasksApi.cancel(id);
  }

  return {
    tasks,
    selectedId,
    drawerOpen,
    activeCount,
    linesFor,
    restoreActive,
    track,
    open,
    close,
    cancel,
  };
});
