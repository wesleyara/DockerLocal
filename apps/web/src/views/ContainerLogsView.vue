<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import { useContainersStore } from "@/stores/containers.store";
import { useLogStream } from "@/composables/useLogStream";
import LogToolbar from "@/components/logs/LogToolbar.vue";
import LogViewer from "@/components/logs/LogViewer.vue";

const route = useRoute();
const containerId = route.params.id as string;

const store = useContainersStore();
const container = computed(() => store.items.find((c) => c.id === containerId));

const filter = ref("");
const showStdout = ref(true);
const showStderr = ref(true);
const showTimestamps = ref(false);
const wrap = ref(false);
const tail = ref(500);

const path = computed(() => `/containers/${containerId}/logs/stream?tail=${tail.value}`);
const { lines, connected, paused, dropped, ended, clear } = useLogStream(path);

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
    .map((l) => (showTimestamps.value && l.timestamp ? `${l.timestamp} ${l.text}` : l.text))
    .join("\n");
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${container.value?.name ?? containerId}.log`;
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <div class="flex h-[calc(100vh-8rem)] flex-col rounded border border-neutral-200 dark:border-neutral-800">
    <div class="flex items-center justify-between border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
      <h1 class="text-sm font-semibold">
        Logs — {{ container?.name ?? containerId.slice(0, 12) }}
      </h1>
      <span v-if="ended" class="text-xs text-amber-600 dark:text-amber-400">
        stream encerrado ({{ ended.reason }})
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

    <LogViewer :lines="filteredLines" :show-timestamps="showTimestamps" :wrap="wrap" />
  </div>
</template>
