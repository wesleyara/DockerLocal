<script setup lang="ts">
import { computed } from "vue";
import type { ContainerState } from "@dockerlocal/shared";

const props = defineProps<{ state: ContainerState }>();

const colors: Record<ContainerState, string> = {
  running: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  exited: "bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
  created: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  paused: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  restarting: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  dead: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

const classes = computed(() => colors[props.state] ?? colors.exited);
</script>

<template>
  <span class="rounded-full px-2 py-0.5 text-xs font-medium" :class="classes">
    {{ state }}
  </span>
</template>
