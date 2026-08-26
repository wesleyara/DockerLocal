<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { Icon } from "@iconify/vue";
import { imagesApi } from "@/api/images.api";
import { fsApi } from "@/api/fs.api";
import { useFileBrowser } from "@/composables/useFileBrowser";
import { useTasksStore } from "@/stores/tasks.store";
import { useToast } from "@/composables/useToast";

const open = defineModel<boolean>("open", { default: false });

const fileBrowser = useFileBrowser();
const tasksStore = useTasksStore();
const toast = useToast();

const contextPath = ref<string | null>(null);
const dockerfilePath = ref<string | null>(null);
const tags = ref<string[]>([""]);
const buildArgs = reactive<{ key: string; value: string }[]>([]);
const noCache = ref(false);
const target = ref("");
const submitting = ref(false);
const previewContent = ref<string | null>(null);
const previewTruncated = ref(false);

function dirnameOf(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx <= 0 ? "/" : path.slice(0, idx);
}

watch(open, (isOpen) => {
  if (!isOpen) return;
  contextPath.value = null;
  dockerfilePath.value = null;
  tags.value = [""];
  buildArgs.length = 0;
  noCache.value = false;
  target.value = "";
  previewContent.value = null;
});

async function pickDockerfile(): Promise<void> {
  const path = await fileBrowser.open({ mode: "dockerfile", title: "Escolha um Dockerfile" });
  if (!path) return;
  dockerfilePath.value = path;
  if (!contextPath.value) contextPath.value = dirnameOf(path);

  try {
    const result = await fsApi.read(path);
    previewContent.value = result.content;
    previewTruncated.value = result.truncated;
  } catch {
    previewContent.value = null;
  }
}

async function pickContext(): Promise<void> {
  const path = await fileBrowser.open({ mode: "dir", title: "Escolha a pasta de contexto" });
  if (path) contextPath.value = path;
}

function addTag(): void {
  tags.value.push("");
}
function removeTag(index: number): void {
  tags.value.splice(index, 1);
}
function addBuildArg(): void {
  buildArgs.push({ key: "", value: "" });
}
function removeBuildArg(index: number): void {
  buildArgs.splice(index, 1);
}

const canSubmit = computed(
  () =>
    !!contextPath.value &&
    !!dockerfilePath.value &&
    tags.value.some((t) => t.trim().length > 0) &&
    !submitting.value,
);

function close(): void {
  open.value = false;
}

async function submit(): Promise<void> {
  if (!canSubmit.value || !contextPath.value || !dockerfilePath.value) return;

  submitting.value = true;
  try {
    const finalTags = tags.value.map((t) => t.trim()).filter(Boolean);
    const finalBuildArgs = Object.fromEntries(
      buildArgs.filter((a) => a.key.trim()).map((a) => [a.key.trim(), a.value]),
    );

    const { taskId } = await imagesApi.build({
      contextPath: contextPath.value,
      dockerfile: dockerfilePath.value,
      tags: finalTags,
      buildArgs: Object.keys(finalBuildArgs).length ? finalBuildArgs : undefined,
      noCache: noCache.value || undefined,
      target: target.value.trim() || undefined,
    });

    tasksStore.track({
      id: taskId,
      kind: "image-build",
      label: `build ${finalTags[0]}`,
      status: "running",
      startedAt: Date.now(),
      meta: { tags: finalTags },
    });
    tasksStore.open(taskId);
    close();
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Falha ao iniciar build");
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
          Buildar imagem a partir de um Dockerfile
        </h2>
        <button type="button" class="rounded-app-sm p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" @click="close">
          <Icon icon="lucide:x" class="h-4 w-4" />
        </button>
      </div>

      <div class="flex flex-col gap-1">
        <span class="text-xs font-medium text-slate-500">Dockerfile</span>
        <div class="flex items-center gap-2">
          <span class="min-w-0 flex-1 truncate rounded-app-sm border border-slate-300 bg-slate-50 px-2 py-1.5 text-xs font-mono dark:border-slate-700 dark:bg-slate-950" :title="dockerfilePath ?? ''">
            {{ dockerfilePath ?? "Nenhum arquivo escolhido" }}
          </span>
          <button type="button" class="shrink-0 rounded-app-sm px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" @click="pickDockerfile">
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
        <span class="text-xs font-medium text-slate-500">Contexto de build</span>
        <div class="flex items-center gap-2">
          <span class="min-w-0 flex-1 truncate rounded-app-sm border border-slate-300 bg-slate-50 px-2 py-1.5 text-xs font-mono dark:border-slate-700 dark:bg-slate-950" :title="contextPath ?? ''">
            {{ contextPath ?? "Nenhuma pasta escolhida" }}
          </span>
          <button type="button" class="shrink-0 rounded-app-sm px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" @click="pickContext">
            Escolher
          </button>
        </div>
      </div>

      <div class="flex flex-col gap-1.5">
        <span class="text-xs font-medium text-slate-500">Tags</span>
        <div v-for="(_, i) in tags" :key="i" class="flex items-center gap-2">
          <input
            v-model="tags[i]"
            type="text"
            placeholder="minha-app:latest"
            class="min-w-0 flex-1 rounded-app-sm border border-slate-300 px-2 py-1.5 text-sm font-mono dark:border-slate-700 dark:bg-slate-800"
          />
          <button v-if="tags.length > 1" type="button" class="shrink-0 rounded-app-sm p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" @click="removeTag(i)">
            <Icon icon="lucide:x" class="h-3.5 w-3.5" />
          </button>
        </div>
        <button type="button" class="w-fit text-xs font-medium text-[var(--color-accent)] hover:underline" @click="addTag">
          + adicionar tag
        </button>
      </div>

      <div class="flex flex-col gap-1.5">
        <span class="text-xs font-medium text-slate-500">Build args</span>
        <div v-for="(arg, i) in buildArgs" :key="i" class="flex items-center gap-2">
          <input v-model="arg.key" type="text" placeholder="CHAVE" class="min-w-0 flex-1 rounded-app-sm border border-slate-300 px-2 py-1.5 text-xs font-mono dark:border-slate-700 dark:bg-slate-800" />
          <input v-model="arg.value" type="text" placeholder="valor" class="min-w-0 flex-1 rounded-app-sm border border-slate-300 px-2 py-1.5 text-xs font-mono dark:border-slate-700 dark:bg-slate-800" />
          <button type="button" class="shrink-0 rounded-app-sm p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" @click="removeBuildArg(i)">
            <Icon icon="lucide:x" class="h-3.5 w-3.5" />
          </button>
        </div>
        <button type="button" class="w-fit text-xs font-medium text-[var(--color-accent)] hover:underline" @click="addBuildArg">
          + adicionar build arg
        </button>
      </div>

      <div class="flex flex-wrap items-center gap-4">
        <label class="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300">
          <input v-model="noCache" type="checkbox" class="rounded" />
          --no-cache
        </label>
        <label class="flex flex-1 items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300">
          target:
          <input v-model="target" type="text" placeholder="opcional" class="min-w-0 flex-1 rounded-app-sm border border-slate-300 px-2 py-1 text-xs font-mono dark:border-slate-700 dark:bg-slate-800" />
        </label>
      </div>

      <div class="mt-1 flex justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
        <button type="button" class="rounded-app-sm px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" @click="close">
          Cancelar
        </button>
        <button
          type="submit"
          class="rounded-app-sm bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="!canSubmit"
        >
          Buildar
        </button>
      </div>
    </form>
  </div>
</template>
