<script setup lang="ts">
import { computed } from "vue";
import { Icon } from "@iconify/vue";
import type { ContainerState } from "@dockerlocal/shared";

const props = defineProps<{ state: ContainerState }>();

const colors: Record<ContainerState, string> = {
  running: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  exited: "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  created: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  paused: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  restarting: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  dead: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

const icons: Record<ContainerState, string> = {
  running: "lucide:play",
  exited: "lucide:square",
  created: "lucide:circle-dashed",
  paused: "lucide:pause",
  restarting: "lucide:rotate-cw",
  dead: "lucide:circle-x",
};

const classes = computed(() => colors[props.state] ?? colors.exited);
const icon = computed(() => icons[props.state] ?? icons.exited);
</script>

<template>
  <span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium" :class="classes">
    <Icon :icon="icon" class="h-3 w-3" />
    {{ state }}
  </span>
</template>
