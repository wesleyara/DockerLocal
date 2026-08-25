import { reactive, ref, shallowRef } from "vue";
import { defineStore } from "pinia";
import type { VolumeSummary } from "@dockerlocal/shared";
import { volumesApi } from "@/api/volumes.api";

export const useVolumesStore = defineStore("volumes", () => {
  const items = shallowRef<VolumeSummary[]>([]);
  const warnings = shallowRef<string[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const pending = reactive(new Set<string>());

  let inFlight: Promise<void> | null = null;

  async function fetch(force = false): Promise<void> {
    if (inFlight && !force) return inFlight;

    loading.value = true;
    inFlight = volumesApi
      .list()
      .then((result) => {
        items.value = result.volumes;
        warnings.value = result.warnings;
        error.value = null;
      })
      .catch((err: unknown) => {
        error.value = err instanceof Error ? err.message : "Falha ao carregar volumes";
      })
      .finally(() => {
        loading.value = false;
        inFlight = null;
      });

    return inFlight;
  }

  async function remove(name: string, opts?: { force?: boolean }): Promise<void> {
    pending.add(name);
    try {
      await volumesApi.remove(name, opts);
      await fetch(true);
    } finally {
      pending.delete(name);
    }
  }

  async function prune(all = false): Promise<unknown> {
    const result = await volumesApi.prune(all);
    await fetch(true);
    return result;
  }

  return { items, warnings, loading, error, pending, fetch, remove, prune };
});
