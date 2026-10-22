<script setup lang="ts">
import { Icon } from "@iconify/vue";
import type { Task } from "@dockerlocal/shared";
import { useTasksStore } from "@/stores/tasks.store";

defineProps<{ task: Task }>();

const store = useTasksStore();
</script>

<template>
  <button
    type="button"
    :title="`${task.label} em andamento — clique para acompanhar`"
    class="inline-flex max-w-48 items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700 hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-900/70"
    @click.stop.prevent="store.open(task.id)"
  >
    <Icon icon="lucide:loader-2" class="h-3 w-3 shrink-0 animate-spin" />
    <span class="truncate">{{ task.label }}</span>
  </button>
</template>
