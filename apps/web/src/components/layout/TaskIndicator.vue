<script setup lang="ts">
import { computed } from "vue";
import { Icon } from "@iconify/vue";
import { useTasksStore } from "@/stores/tasks.store";

const store = useTasksStore();

const mostRecentActiveId = computed(() => {
  const active = [...store.tasks.values()].filter((t) => t.status === "running");
  active.sort((a, b) => b.startedAt - a.startedAt);
  return active[0]?.id ?? null;
});

function openDrawer(): void {
  const id = mostRecentActiveId.value ?? store.selectedId;
  if (id) store.open(id);
}
</script>

<template>
  <button
    v-if="store.activeCount > 0"
    type="button"
    title="Ver tasks em andamento"
    class="flex items-center gap-1.5 rounded-app-sm px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
    @click="openDrawer"
  >
    <Icon icon="lucide:loader-2" class="h-3.5 w-3.5 animate-spin text-blue-500" />
    {{ store.activeCount }} task{{ store.activeCount > 1 ? "s" : "" }} em andamento
  </button>
</template>
