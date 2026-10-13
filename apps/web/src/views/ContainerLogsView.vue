<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Icon } from "@iconify/vue";
import { useContainersStore } from "@/stores/containers.store";
import { useLogStream } from "@/composables/useLogStream";
import LogToolbar from "@/components/logs/LogToolbar.vue";
import LogViewer from "@/components/logs/LogViewer.vue";
import StateBadge from "@/components/common/StateBadge.vue";
import ActionButtons from "@/components/common/ActionButtons.vue";

const route = useRoute();
const router = useRouter();
const containerId = route.params.id as string;

const store = useContainersStore();
if (store.items.length === 0) void store.fetch();
const container = computed(() => store.items.find((c) => c.id === containerId));

function goBack(): void {
  if (window.history.length > 1) router.back();
  else router.push("/containers");
}

function handleRemoved(): void {
  router.push("/containers");
}

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
  <div class="flex h-[calc(100vh-11rem)] flex-col rounded-app-md border border-slate-200 sm:h-[calc(100vh-8rem)] dark:border-slate-800">
    <div class="flex items-center gap-3 border-b border-slate-200 px-3 py-2.5 dark:border-slate-800">
      <button
        type="button"
        title="Voltar para Containers"
        class="flex items-center gap-1 rounded-app-sm px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        @click="goBack"
      >
        <Icon icon="lucide:arrow-left" class="h-4 w-4" />
        Voltar
      </button>

      <div class="h-5 w-px bg-slate-200 dark:bg-slate-800" />

      <Icon icon="lucide:scroll-text" class="h-4 w-4 shrink-0 text-slate-400" />
      <h1 class="flex min-w-0 items-center gap-2 text-sm font-semibold">
        <span class="truncate">{{ container?.name ?? containerId.slice(0, 12) }}</span>
        <StateBadge v-if="container" :state="container.state" />
      </h1>

      <span v-if="ended" class="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
        <Icon icon="lucide:triangle-alert" class="h-3.5 w-3.5" />
        stream encerrado ({{ ended.reason }})
      </span>

      <ActionButtons
        v-if="container"
        class="ml-auto"
        :container="container"
        :pending="store.pending.has(container.id)"
        :show-logs-link="false"
        @removed="handleRemoved"
      />
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
