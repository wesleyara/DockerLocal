import { ref, shallowRef } from "vue";
import { defineStore } from "pinia";
import type {
  ComposeBuildBody,
  ComposeDownBody,
  ComposeServicesBody,
  ComposeUpBody,
  StackSummary,
} from "@dockerlocal/shared";
import { stacksApi } from "@/api/stacks.api";
import { tasksApi } from "@/api/tasks.api";
import { ApiError } from "@/api/http";
import { useTasksStore } from "./tasks.store";

export type StackAction = "up" | "down" | "start" | "stop" | "restart" | "pull" | "build";

export const useStacksStore = defineStore("stacks", () => {
  const items = shallowRef<StackSummary[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const pending = ref(new Set<string>());

  let inFlight: Promise<void> | null = null;

  async function fetch(force = false): Promise<void> {
    if (inFlight && !force) return inFlight;

    loading.value = true;
    inFlight = stacksApi
      .list()
      .then((result) => {
        items.value = result;
        error.value = null;
      })
      .catch((err: unknown) => {
        error.value = err instanceof Error ? err.message : "Falha ao carregar stacks";
      })
      .finally(() => {
        loading.value = false;
        inFlight = null;
      });

    return inFlight;
  }

  /**
   * Dispara uma ação de compose. Em 409 (stack ocupada) reabre o drawer da
   * task já em andamento em vez de mostrar erro — é o que o `taskId` do
   * corpo do 409 serve para.
   */
  async function act(
    project: string,
    action: StackAction,
    body?: ComposeUpBody | ComposeDownBody | ComposeServicesBody | ComposeBuildBody,
  ): Promise<void> {
    const tasks = useTasksStore();
    const set = new Set(pending.value);
    set.add(project);
    pending.value = set;

    try {
      let taskId: string;
      try {
        const result = await stacksApi[action](project, body as never);
        taskId = result.taskId;
      } catch (err) {
        if (err instanceof ApiError && err.statusCode === 409 && err.taskId) {
          tasks.open(err.taskId);
          return;
        }
        throw err;
      }

      // `up` com `--build` vira `compose-up-build` no servidor (ver
      // stacks.controller.ts) — busca a task real em vez de adivinhar o
      // `kind`, senão o build fica preso na viewer de PullProgress até o
      // `task-end` corrigir, quando a saída já era.
      const task = await tasksApi.get(taskId).catch(() => ({
        id: taskId,
        kind: `compose-${action}`,
        label: `${action} ${project}`,
        status: "running" as const,
        startedAt: Date.now(),
      }));
      tasks.track(task);
      tasks.open(taskId);
      void fetch(true);
    } finally {
      const next = new Set(pending.value);
      next.delete(project);
      pending.value = next;
    }
  }

  async function removeFromRegistry(project: string): Promise<void> {
    await stacksApi.removeFromRegistry(project);
    await fetch(true);
  }

  /**
   * Rebuild da imagem + troca do próprio container do DockerLocal. A task
   * acompanha só a fase de build — a troca em si mata este processo no meio
   * (ver skill self-update no backend), então a conexão SSE cai sozinha
   * quando o novo container assume; isso é esperado, não uma falha.
   */
  async function selfRebuild(): Promise<void> {
    const tasks = useTasksStore();
    const { taskId } = await stacksApi.selfRebuild();
    tasks.track({
      id: taskId,
      kind: "compose-build",
      label: "rebuild do próprio DockerLocal",
      status: "running",
      startedAt: Date.now(),
    });
    tasks.open(taskId);
  }

  return { items, loading, error, pending, fetch, act, removeFromRegistry, selfRebuild };
});
