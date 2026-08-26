<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Icon } from "@iconify/vue";
import type { FsEntry, FsRoot } from "@dockerlocal/shared";
import { fsApi } from "@/api/fs.api";
import { useFileBrowser } from "@/composables/useFileBrowser";
import RootSelector from "./RootSelector.vue";
import FileList from "./FileList.vue";

const { isOpen, options, resolve } = useFileBrowser();

const roots = ref<FsRoot[]>([]);
const currentPath = ref<string | null>(null);
const currentRoot = ref<string | null>(null);
const entries = ref<FsEntry[]>([]);
const suggestedNames = ref<Set<string>>(new Set());
const selectedEntry = ref<FsEntry | null>(null);
const previewContent = ref<string | null>(null);
const previewTruncated = ref(false);
const loading = ref(false);
const error = ref<string | null>(null);

const modeLabel = computed(() => {
  if (options.value.mode === "compose") return "um docker-compose.yml";
  if (options.value.mode === "dockerfile") return "um Dockerfile";
  return "uma pasta";
});

const canConfirm = computed(() => {
  if (options.value.mode === "dir") return currentPath.value !== null;
  return selectedEntry.value !== null;
});

async function loadDir(path: string): Promise<void> {
  loading.value = true;
  error.value = null;
  selectedEntry.value = null;
  previewContent.value = null;
  try {
    const [list, detect] = await Promise.all([fsApi.list(path), fsApi.detect(path)]);
    currentPath.value = list.path;
    entries.value = list.entries;
    suggestedNames.value = new Set([...detect.composeFiles, ...detect.dockerfiles]);
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Falha ao listar diretório";
  } finally {
    loading.value = false;
  }
}

async function selectFile(entry: FsEntry): Promise<void> {
  selectedEntry.value = entry;
  previewContent.value = null;
  previewTruncated.value = false;
  try {
    const result = await fsApi.read(entry.path);
    previewContent.value = result.content;
    previewTruncated.value = result.truncated;
  } catch {
    previewContent.value = null;
  }
}

watch(isOpen, async (open) => {
  if (!open) return;
  error.value = null;
  try {
    roots.value = await fsApi.roots();
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Falha ao carregar raízes";
    return;
  }
  const first = roots.value[0];
  if (first) {
    currentRoot.value = first.path;
    await loadDir(first.path);
  }
});

function onSelectRoot(path: string): void {
  currentRoot.value = path;
  void loadDir(path);
}

function confirm(): void {
  if (options.value.mode === "dir") {
    if (currentPath.value) resolve(currentPath.value);
  } else if (selectedEntry.value) {
    resolve(selectedEntry.value.path);
  }
}

function cancel(): void {
  resolve(null);
}
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    @click.self="cancel"
  >
    <div class="flex max-h-[80vh] w-full max-w-2xl flex-col gap-3 rounded-app-lg border border-slate-200 bg-white p-5 shadow-[var(--shadow-elevated)] dark:border-slate-800 dark:bg-slate-900">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h2 class="text-base font-semibold text-slate-900 dark:text-slate-100">
            {{ options.title ?? `Escolha ${modeLabel}` }}
          </h2>
          <p class="mt-1 text-xs text-slate-500">Sugestões destacadas com <Icon icon="lucide:sparkles" class="inline h-3 w-3 text-amber-500" /> foram detectadas automaticamente.</p>
        </div>
        <button
          type="button"
          class="rounded-app-sm p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          @click="cancel"
        >
          <Icon icon="lucide:x" class="h-4 w-4" />
        </button>
      </div>

      <RootSelector :roots="roots" :active-root="currentRoot" @select="onSelectRoot" />

      <div v-if="error" class="rounded-app-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
        {{ error }}
      </div>

      <div v-else-if="loading && entries.length === 0" class="flex items-center justify-center py-10 text-slate-400">
        <Icon icon="lucide:loader-circle" class="h-5 w-5 animate-spin" />
      </div>

      <FileList
        v-else-if="currentPath && currentRoot"
        :path="currentPath"
        :root="currentRoot"
        :root-label="roots.find((r) => r.path === currentRoot)?.label ?? currentRoot"
        :entries="entries"
        :mode="options.mode"
        :selected-path="selectedEntry?.path ?? null"
        :suggested-names="suggestedNames"
        @navigate="loadDir"
        @select="selectFile"
      />

      <div v-if="previewContent !== null" class="flex flex-col gap-1">
        <p class="text-xs font-medium text-slate-500">
          Pré-visualização
          <span v-if="previewTruncated" class="text-amber-600 dark:text-amber-400">(truncado em 512 KB)</span>
        </p>
        <pre class="max-h-40 overflow-auto rounded-app-md bg-slate-50 p-2 text-xs text-slate-700 dark:bg-slate-950 dark:text-slate-300">{{ previewContent }}</pre>
      </div>

      <div class="mt-1 flex items-center justify-between gap-3">
        <span class="min-w-0 truncate text-xs text-slate-500" :title="selectedEntry?.path ?? currentPath ?? ''">
          {{ selectedEntry?.path ?? currentPath }}
        </span>
        <div class="flex shrink-0 gap-2">
          <button
            type="button"
            class="rounded-app-sm px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            @click="cancel"
          >
            Cancelar
          </button>
          <button
            type="button"
            class="rounded-app-sm bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="!canConfirm"
            @click="confirm"
          >
            {{ options.mode === "dir" ? "Usar esta pasta" : "Usar este arquivo" }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
