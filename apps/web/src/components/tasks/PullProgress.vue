<script setup lang="ts">
import { computed } from "vue";
import { Icon } from "@iconify/vue";
import type { TaskLine } from "@dockerlocal/shared";
import { formatBytes } from "@/utils/format";

const props = defineProps<{
  lines: TaskLine[];
}>();

interface Layer {
  id: string;
  status: string;
  current?: number;
  total?: number;
  done?: boolean;
}

const DONE_STATUSES = new Set(["Already exists", "Pull complete"]);

const layers = computed<Layer[]>(() => {
  const byId = new Map<string, Layer>();
  for (const line of props.lines) {
    if (!line.progress) continue;
    const { id, status, current, total, done } = line.progress;
    byId.set(id, { id, status, current, total, done });
  }
  return [...byId.values()];
});

// Última linha sem `progress` (ex.: "Pulling from library/node",
// "Status: Downloaded newer image...") — mensagem de topo/rodapé do pull.
const summary = computed(() => {
  for (let i = props.lines.length - 1; i >= 0; i--) {
    const line = props.lines[i];
    if (!line.progress) return line.text;
  }
  return undefined;
});

function percent(layer: Layer): number | undefined {
  if (!layer.total || layer.total <= 0 || layer.current === undefined) return undefined;
  return Math.min(100, Math.round((layer.current / layer.total) * 100));
}

function isDone(layer: Layer): boolean {
  return layer.done ?? DONE_STATUSES.has(layer.status);
}
</script>

<template>
  <div class="flex-1 overflow-y-auto px-4 py-3">
    <p v-if="summary" class="mb-3 text-xs text-slate-500 dark:text-slate-400">
      {{ summary }}
    </p>

    <div v-if="layers.length === 0" class="flex flex-col items-center justify-center gap-2 py-12 text-slate-400 dark:text-slate-600">
      <Icon icon="lucide:download" class="h-8 w-8" />
      <p class="text-sm">Aguardando início do download…</p>
    </div>

    <ul v-else class="space-y-2">
      <li
        v-for="layer in layers"
        :key="layer.id"
        class="rounded-app-sm border border-slate-200 px-3 py-2 dark:border-slate-800"
      >
        <div class="mb-1 flex items-center justify-between gap-2 text-xs">
          <span class="font-mono text-slate-500 dark:text-slate-400">{{ layer.id }}</span>
          <span
            class="flex items-center gap-1 font-medium"
            :class="isDone(layer) ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'"
          >
            <Icon v-if="isDone(layer)" icon="lucide:check" class="h-3.5 w-3.5" />
            {{ layer.status }}
            <template v-if="percent(layer) !== undefined && layer.total">
              — {{ formatBytes(layer.current ?? 0) }} / {{ formatBytes(layer.total) }}
            </template>
          </span>
        </div>

        <div
          v-if="percent(layer) !== undefined"
          class="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
        >
          <div
            class="h-full rounded-full bg-blue-600 transition-[width] duration-150 dark:bg-blue-400"
            :style="{ width: `${percent(layer)}%` }"
          />
        </div>
      </li>
    </ul>
  </div>
</template>
