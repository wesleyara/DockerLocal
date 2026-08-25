import { computed, reactive, ref, shallowRef } from "vue";
import { defineStore } from "pinia";
import type { ContainerSummary } from "@dockerlocal/shared";
import { containersApi } from "@/api/containers.api";

export type ContainerAction =
  | "start"
  | "stop"
  | "restart"
  | "pause"
  | "unpause"
  | "remove";

export const useContainersStore = defineStore("containers", () => {
  const items = shallowRef<ContainerSummary[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const pending = reactive(new Set<string>());

  let inFlight: Promise<void> | null = null;

  async function fetch(force = false): Promise<void> {
    if (inFlight && !force) return inFlight;

    loading.value = true;
    inFlight = containersApi
      .list({ all: true })
      .then((result) => {
        items.value = result;
        error.value = null;
      })
      .catch((err: unknown) => {
        error.value = err instanceof Error ? err.message : "Falha ao carregar containers";
      })
      .finally(() => {
        loading.value = false;
        inFlight = null;
      });

    return inFlight;
  }

  async function act(
    id: string,
    action: ContainerAction,
    opts?: { force?: boolean; v?: boolean; t?: number },
  ): Promise<void> {
    pending.add(id);
    try {
      switch (action) {
        case "start":
          await containersApi.start(id);
          break;
        case "stop":
          await containersApi.stop(id, opts?.t);
          break;
        case "restart":
          await containersApi.restart(id, opts?.t);
          break;
        case "pause":
          await containersApi.pause(id);
          break;
        case "unpause":
          await containersApi.unpause(id);
          break;
        case "remove":
          await containersApi.remove(id, { force: opts?.force, v: opts?.v });
          break;
      }
      await fetch(true);
    } finally {
      pending.delete(id);
    }
  }

  const byProject = computed(() => {
    const groups = new Map<string, ContainerSummary[]>();
    for (const c of items.value) {
      const key = c.compose?.project ?? "";
      const group = groups.get(key) ?? [];
      group.push(c);
      groups.set(key, group);
    }
    return groups;
  });

  return { items, loading, error, pending, fetch, act, byProject };
});
