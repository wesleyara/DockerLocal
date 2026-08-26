<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Icon } from "@iconify/vue";
import type { StackDetail } from "@dockerlocal/shared";
import { stacksApi } from "@/api/stacks.api";
import { useStacksStore } from "@/stores/stacks.store";
import { useLogStream } from "@/composables/useLogStream";
import { useToast } from "@/composables/useToast";
import { useConfirm } from "@/composables/useConfirm";
import LogToolbar from "@/components/logs/LogToolbar.vue";
import LogViewer from "@/components/logs/LogViewer.vue";
import StackServiceRow from "@/components/stacks/StackServiceRow.vue";
import ErrorBanner from "@/components/common/ErrorBanner.vue";
import SelfBadge from "@/components/common/SelfBadge.vue";

const route = useRoute();
const router = useRouter();
const toast = useToast();
const { confirm } = useConfirm();
const store = useStacksStore();

const project = computed(() => String(route.params.project ?? ""));

const detail = ref<StackDetail | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);

async function loadDetail(): Promise<void> {
  loading.value = true;
  try {
    detail.value = await stacksApi.detail(project.value);
    error.value = null;
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Falha ao carregar stack";
  } finally {
    loading.value = false;
  }
}

watch(project, loadDetail, { immediate: true });

// A store global de stacks é refeita quando a task de compose termina
// (tasks.store.ts::onFinished) — observar `items` é o gatilho para
// recarregar o detalhe, já que o 202 do `act()` volta antes do `up`/`down`
// de fato terminar.
watch(
  () => store.items,
  () => {
    if (!loading.value) void loadDetail();
  },
);
void store.fetch();

const busy = computed(() => store.pending.has(project.value));

async function run(action: "up" | "restart" | "build"): Promise<void> {
  try {
    await store.act(project.value, action);
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Falha ao executar ação");
  }
}

async function handleDown(): Promise<void> {
  const ok = await confirm({
    title: `Derrubar "${project.value}"`,
    message: "Isso para e remove os containers da stack. Os volumes são preservados.",
    confirmLabel: "Derrubar",
  });
  if (!ok) return;

  try {
    await store.act(project.value, "down");
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Falha ao derrubar stack");
  }
}

function goBack(): void {
  if (window.history.length > 1) router.back();
  else router.push("/stacks");
}

// --- logs agregados ---
const serviceFilter = ref<string>("");
const showStdout = ref(true);
const showStderr = ref(true);
const showTimestamps = ref(false);
const wrap = ref(false);
const tail = ref(200);

const path = computed(() => `/stacks/${project.value}/logs/stream?tail=${tail.value}`);
const { lines, connected, paused, dropped, clear } = useLogStream(path, { closeOnEnd: false });

const serviceByContainerId = computed(() => {
  const map = new Map<string, string>();
  for (const service of detail.value?.services ?? []) {
    for (const c of service.containers) map.set(c.id, service.name);
  }
  return map;
});

function resolveContainerLabel(containerId: string): string {
  return serviceByContainerId.value.get(containerId) ?? containerId.slice(0, 12);
}

const textFilter = ref("");
const filteredLines = computed(() => {
  const needle = textFilter.value.trim().toLowerCase();
  return lines.value.filter((line) => {
    if (line.stream === "stdout" && !showStdout.value) return false;
    if (line.stream === "stderr" && !showStderr.value) return false;
    if (
      serviceFilter.value &&
      resolveContainerLabel(line.containerId ?? "") !== serviceFilter.value
    ) {
      return false;
    }
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
  a.download = `${project.value}.log`;
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center gap-3">
      <button
        type="button"
        title="Voltar para Stacks"
        class="flex items-center gap-1 rounded-app-sm px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        @click="goBack"
      >
        <Icon icon="lucide:arrow-left" class="h-4 w-4" />
        Voltar
      </button>
      <div class="h-5 w-px bg-slate-200 dark:bg-slate-800" />
      <h1 class="page-title flex items-center gap-2">
        <Icon icon="lucide:boxes" class="h-4.5 w-4.5 text-slate-400" />
        {{ project }}
      </h1>
      <SelfBadge v-if="detail?.isSelf" />

      <div v-if="detail" class="ml-auto flex items-center gap-1">
        <Icon v-if="busy" icon="lucide:loader-2" class="h-4 w-4 animate-spin text-slate-400" />
        <template v-else>
          <button
            title="Subir a stack"
            class="flex items-center gap-1 rounded-app-sm px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 dark:text-emerald-400 dark:hover:bg-emerald-950"
            :disabled="!detail.fileExists"
            @click="run('up')"
          >
            <Icon icon="lucide:play" class="h-3.5 w-3.5" />
            Up
          </button>
          <button
            v-if="detail.runningCount > 0"
            :disabled="detail.isSelf"
            :title="detail.isSelf ? 'Não é possível reiniciar a própria stack do DockerLocal' : 'Reiniciar serviços'"
            class="flex items-center gap-1 rounded-app-sm px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent dark:text-blue-400 dark:hover:bg-blue-950"
            @click="run('restart')"
          >
            <Icon icon="lucide:rotate-cw" class="h-3.5 w-3.5" />
            Restart
          </button>
          <button
            v-if="detail.containerCount > 0"
            :disabled="detail.isSelf"
            :title="detail.isSelf ? 'Não é possível derrubar a própria stack do DockerLocal' : 'Derrubar a stack'"
            class="flex items-center gap-1 rounded-app-sm px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent dark:text-amber-400 dark:hover:bg-amber-950"
            @click="handleDown"
          >
            <Icon icon="lucide:square" class="h-3.5 w-3.5" />
            Down
          </button>
          <button
            title="Rebuildar imagens da stack"
            class="flex items-center gap-1 rounded-app-sm px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            @click="run('build')"
          >
            <Icon icon="lucide:hammer" class="h-3.5 w-3.5" />
            Build
          </button>
        </template>
      </div>
    </div>

    <ErrorBanner v-if="error" :message="error" />

    <template v-else-if="detail">
      <div class="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
        <span class="font-mono">{{ detail.workingDir }}</span>
        <span>{{ detail.configFiles.join(", ") }}</span>
        <span
          v-if="!detail.fileExists"
          class="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-red-700 dark:bg-red-900/40 dark:text-red-300"
        >
          <Icon icon="lucide:file-x" class="h-3 w-3" />
          arquivo ausente
        </span>
      </div>

      <div class="flex flex-col gap-2">
        <StackServiceRow v-for="service in detail.services" :key="service.name" :service="service" />
      </div>

      <div v-if="detail.volumes.length || detail.networks.length" class="flex flex-wrap gap-6 text-xs">
        <div v-if="detail.volumes.length">
          <p class="mb-1 font-medium text-slate-600 dark:text-slate-300">Volumes</p>
          <ul class="flex flex-col gap-0.5 font-mono text-slate-500">
            <li v-for="v in detail.volumes" :key="v">{{ v }}</li>
          </ul>
        </div>
        <div v-if="detail.networks.length">
          <p class="mb-1 font-medium text-slate-600 dark:text-slate-300">Networks</p>
          <ul class="flex flex-col gap-0.5 font-mono text-slate-500">
            <li v-for="n in detail.networks" :key="n">{{ n }}</li>
          </ul>
        </div>
      </div>

      <div class="flex h-[28rem] flex-col rounded-app-md border border-slate-200 dark:border-slate-800">
        <div class="flex items-center gap-2 border-b border-slate-200 px-3 py-2 dark:border-slate-800">
          <Icon icon="lucide:scroll-text" class="h-4 w-4 text-slate-400" />
          <h2 class="text-sm font-semibold">Logs agregados</h2>
          <select
            v-model="serviceFilter"
            class="ml-auto rounded-app-sm border border-slate-300 bg-transparent px-2 py-1 text-xs dark:border-slate-700"
          >
            <option value="">Todos os serviços</option>
            <option v-for="service in detail.services" :key="service.name" :value="service.name">
              {{ service.name }}
            </option>
          </select>
        </div>

        <LogToolbar
          v-model:filter="textFilter"
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
  </div>
</template>
