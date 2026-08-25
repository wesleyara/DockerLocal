<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import { useContainersStore } from "@/stores/containers.store";
import { useLogStream } from "@/composables/useLogStream";
import LogToolbar from "@/components/logs/LogToolbar.vue";
import LogViewer from "@/components/logs/LogViewer.vue";

const route = useRoute();
const ids = computed(() => String(route.query.ids ?? "").split(",").filter(Boolean));
const projectLabel = computed(() => String(route.query.project ?? "") || "Sem projeto");

const store = useContainersStore();
if (store.items.length === 0) void store.fetch();

const nameById = computed(() => {
  const map = new Map<string, string>();
  for (const c of store.items) map.set(c.id, c.name);
  return map;
});

function resolveContainerLabel(containerId: string): string {
  return nameById.value.get(containerId) ?? containerId.slice(0, 12);
}

const filter = ref("");
const showStdout = ref(true);
const showStderr = ref(true);
const showTimestamps = ref(false);
const wrap = ref(false);
const tail = ref(200);

const path = computed(() => `/containers/logs/stream?ids=${ids.value.join(",")}&tail=${tail.value}`);
const { lines, connected, paused, dropped, endedContainers, clear } = useLogStream(path, {
  closeOnEnd: false,
});

const filteredLines = computed(() => {
  const needle = filter.value.trim().toLowerCase();
  return lines.value.filter((line) => {
    if (line.stream === "stdout" && !showStdout.value) return false;
    if (line.stream === "stderr" && !showStderr.value) return false;
    if (needle && !line.text.toLowerCase().includes(needle)) return false;
    return true;
  });
});

function handleDownload(): void {
  const content = filteredLines.value
    .map((l) => {
      const label = l.containerId ? `[${resolveContainerLabel(l.containerId)}] ` : "";
      const time = showTimestamps.value && l.timestamp ? `${l.timestamp} ` : "";
      return `${time}${label}${l.text}`;
    })
    .join("\n");
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${projectLabel.value}.log`;
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <div class="flex h-[calc(100vh-8rem)] flex-col rounded border border-neutral-200 dark:border-neutral-800">
    <div class="flex items-center justify-between border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
      <h1 class="text-sm font-semibold">Logs — {{ projectLabel }} ({{ ids.length }} containers)</h1>
      <span v-if="endedContainers.size > 0" class="text-xs text-amber-600 dark:text-amber-400">
        {{ endedContainers.size }} container(es) encerrados
      </span>
    </div>

    <LogToolbar
      v-model:filter="filter"
      v-model:show-stdout="showStdout"
      v-model:show-stderr="showStderr"
      v-model:show-timestamps="showTimestamps"
      v-model:wrap="wrap"
      v-model:paused="paused"
      v-model:tail="tail"
      :dropped="dropped"
      :connected="connected"
      @clear="clear"
      @download="handleDownload"
    />

    <LogViewer
      :lines="filteredLines"
      :show-timestamps="showTimestamps"
      :wrap="wrap"
      :resolve-container-label="resolveContainerLabel"
    />
  </div>
</template>
