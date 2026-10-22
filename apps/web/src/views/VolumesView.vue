<script setup lang="ts">
import { Icon } from "@iconify/vue";
import { useVolumesStore } from "@/stores/volumes.store";
import { useResourcePolling } from "@/composables/useResourcePolling";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import VolumesTable from "@/components/volumes/VolumesTable.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import ErrorBanner from "@/components/common/ErrorBanner.vue";
import TableSkeleton from "@/components/common/TableSkeleton.vue";

const store = useVolumesStore();
const { confirm } = useConfirm();
const toast = useToast();

useResourcePolling(() => store.fetch(true));

async function pruneUnused(): Promise<void> {
  const ok = await confirm({
    title: "Limpar volumes não utilizados",
    message: "Remove todos os volumes sem nenhum container usando-os. Essa ação apaga dados sem volta.",
    confirmLabel: "Limpar",
    requireTypedName: "prune",
  });
  if (!ok) return;
  try {
    await store.prune(true);
    toast.success("Volumes não utilizados removidos.");
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Falha ao limpar volumes");
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <h1 class="page-title flex items-center gap-2">
        <Icon icon="lucide:database" class="h-4.5 w-4.5 text-slate-400" />
        Volumes
      </h1>
      <div class="flex flex-wrap items-center gap-3 sm:gap-4">
        <button
          class="flex items-center gap-1.5 rounded-app-sm px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
          :disabled="store.items.length === 0"
          title="Remove volumes sem nenhum container usando-os"
          @click="pruneUnused"
        >
          <Icon icon="lucide:sparkles" class="h-3.5 w-3.5" />
          Limpar não utilizados
        </button>
        <span class="text-xs text-slate-500">{{ store.items.length }} no total</span>
      </div>
    </div>

    <div
      v-for="warning in store.warnings"
      :key="warning"
      class="flex items-center gap-2 rounded-app-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
    >
      <Icon icon="lucide:triangle-alert" class="h-4 w-4 shrink-0" />
      {{ warning }}
    </div>

    <ErrorBanner v-if="store.error" :message="store.error" />

    <TableSkeleton
      v-else-if="store.loading && store.items.length === 0"
      :columns="7"
      class="card-surface overflow-hidden rounded-app-lg border border-slate-200/80 dark:border-slate-800"
    />

    <EmptyState
      v-else-if="!store.loading && store.items.length === 0"
      message="Nenhum volume encontrado."
      icon="lucide:database"
    />

    <div v-else class="card-surface overflow-x-auto rounded-app-lg border border-slate-200/80 dark:border-slate-800">
      <VolumesTable :items="store.items" :pending="store.pending" />
    </div>
  </div>
</template>
