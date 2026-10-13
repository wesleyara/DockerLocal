import { ref } from "vue";
import { defineStore } from "pinia";
import type { PruneTarget, SystemDiskUsage, SystemPruneResult } from "@dockerlocal/shared";
import { systemApi, type PruneSystemOptions } from "@/api/system.api";

export const useSystemStore = defineStore("system", () => {
  const diskUsage = ref<SystemDiskUsage | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const pruning = ref(false);

  async function fetchDiskUsage(): Promise<void> {
    loading.value = true;
    try {
      diskUsage.value = await systemApi.diskUsage();
      error.value = null;
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Falha ao carregar uso de disco";
    } finally {
      loading.value = false;
    }
  }

  async function prune(
    targets: PruneTarget[],
    opts: PruneSystemOptions = {},
  ): Promise<SystemPruneResult> {
    pruning.value = true;
    try {
      const result = await systemApi.prune(targets, opts);
      await fetchDiskUsage();
      return result;
    } finally {
      pruning.value = false;
    }
  }

  return { diskUsage, loading, error, pruning, fetchDiskUsage, prune };
});
