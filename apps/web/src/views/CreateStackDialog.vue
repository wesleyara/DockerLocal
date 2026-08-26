<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Icon } from "@iconify/vue";
import { stacksApi } from "@/api/stacks.api";
import { fsApi } from "@/api/fs.api";
import { useFileBrowser } from "@/composables/useFileBrowser";
import { useTasksStore } from "@/stores/tasks.store";
import { useStacksStore } from "@/stores/stacks.store";
import { useToast } from "@/composables/useToast";

const open = defineModel<boolean>("open", { default: false });

const fileBrowser = useFileBrowser();
const tasksStore = useTasksStore();
const stacksStore = useStacksStore();
const toast = useToast();

const composeFilePath = ref<string | null>(null);
const projectName = ref("");
const envFile = ref<string | null>(null);
const upNow = ref(true);
const submitting = ref(false);
const previewContent = ref<string | null>(null);
const previewTruncated = ref(false);

function basenameOf(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx < 0 ? path : path.slice(idx + 1);
}
function dirnameOf(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx <= 0 ? "/" : path.slice(0, idx);
}

watch(open, (isOpen) => {
  if (!isOpen) return;
  composeFilePath.value = null;
  projectName.value = "";
  envFile.value = null;
  upNow.value = true;
  previewContent.value = null;
});

async function pickComposeFile(): Promise<void> {
  const path = await fileBrowser.open({ mode: "compose", title: "Escolha um docker-compose.yml" });
  if (!path) return;
  composeFilePath.value = path;
  if (!projectName.value) {
    projectName.value = basenameOf(dirnameOf(path))
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^[^a-z0-9]+/, "");
  }

  try {
    const result = await fsApi.read(path);
    previewContent.value = result.content;
    previewTruncated.value = result.truncated;
  } catch {
    previewContent.value = null;
  }
}

async function pickEnvFile(): Promise<void> {
  const path = await fileBrowser.open({ mode: "dir", title: "Escolha a pasta do .env" });
  if (path) envFile.value = `${path}/.env`;
}

function clearEnvFile(): void {
  envFile.value = null;
}

const canSubmit = computed(() => !!composeFilePath.value && !submitting.value);

function close(): void {
  open.value = false;
}

async function submit(): Promise<void> {
  if (!canSubmit.value || !composeFilePath.value) return;

  submitting.value = true;
  try {
    const { taskId } = await stacksApi.fromFile({
      composeFilePath: composeFilePath.value,
      projectName: projectName.value.trim() || undefined,
      envFile: envFile.value ?? undefined,
      up: upNow.value,
    });

    tasksStore.track({
      id: taskId,
      kind: upNow.value ? "compose-up" : "compose-register",
      label: `${upNow.value ? "up" : "registrar"} ${projectName.value || composeFilePath.value}`,
      status: "running",
      startedAt: Date.now(),
    });
    tasksStore.open(taskId);
    void stacksStore.fetch(true);
    close();
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Falha ao criar stack");
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    @click.self="close"
  >
    <form
      class="flex max-h-[85vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-app-lg border border-slate-200 bg-white p-5 shadow-[var(--shadow-elevated)] dark:border-slate-800 dark:bg-slate-900"
      @submit.prevent="submit"
    >
      <div class="flex items-start justify-between gap-3">
        <h2 class="text-base font-semibold text-slate-900 dark:text-slate-100">
          Subir stack a partir de um compose file
        </h2>
        <button type="button" class="rounded-app-sm p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" @click="close">
          <Icon icon="lucide:x" class="h-4 w-4" />
        </button>
      </div>

      <div class="flex flex-col gap-1">
        <span class="text-xs font-medium text-slate-500">docker-compose.yml</span>
        <div class="flex items-center gap-2">
          <span class="min-w-0 flex-1 truncate rounded-app-sm border border-slate-300 bg-slate-50 px-2 py-1.5 text-xs font-mono dark:border-slate-700 dark:bg-slate-950" :title="composeFilePath ?? ''">
            {{ composeFilePath ?? "Nenhum arquivo escolhido" }}
          </span>
          <button type="button" class="shrink-0 rounded-app-sm px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" @click="pickComposeFile">
            Escolher
          </button>
        </div>
      </div>

      <div v-if="previewContent !== null" class="flex flex-col gap-1">
        <p class="text-xs font-medium text-slate-500">
          Pré-visualização
          <span v-if="previewTruncated" class="text-amber-600 dark:text-amber-400">(truncado em 512 KB)</span>
        </p>
        <pre class="max-h-32 overflow-auto rounded-app-md bg-slate-50 p-2 text-xs text-slate-700 dark:bg-slate-950 dark:text-slate-300">{{ previewContent }}</pre>
      </div>

      <div class="flex flex-col gap-1">
        <span class="text-xs font-medium text-slate-500">Nome do projeto</span>
        <input
          v-model="projectName"
          type="text"
          placeholder="derivado da pasta"
          class="rounded-app-sm border border-slate-300 px-2 py-1.5 text-sm font-mono dark:border-slate-700 dark:bg-slate-800"
        />
      </div>

      <div class="flex flex-col gap-1">
        <span class="text-xs font-medium text-slate-500">.env (opcional)</span>
        <div class="flex items-center gap-2">
          <span class="min-w-0 flex-1 truncate rounded-app-sm border border-slate-300 bg-slate-50 px-2 py-1.5 text-xs font-mono dark:border-slate-700 dark:bg-slate-950" :title="envFile ?? ''">
            {{ envFile ?? "Nenhum" }}
          </span>
          <button type="button" class="shrink-0 rounded-app-sm px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" @click="pickEnvFile">
            Escolher pasta
          </button>
          <button v-if="envFile" type="button" class="shrink-0 rounded-app-sm p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" @click="clearEnvFile">
            <Icon icon="lucide:x" class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <label class="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300">
        <input v-model="upNow" type="checkbox" class="rounded" />
        Subir agora (docker compose up -d)
      </label>

      <div class="mt-1 flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
        <button type="button" class="rounded-app-sm px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" @click="close">
          Cancelar
        </button>
        <button
          type="submit"
          class="rounded-app-sm bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="!canSubmit"
        >
          {{ upNow ? "Subir stack" : "Registrar" }}
        </button>
      </div>
    </form>
  </div>
</template>
