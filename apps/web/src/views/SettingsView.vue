<script setup lang="ts">
import { onMounted, ref } from "vue";
import { Icon } from "@iconify/vue";
import type { FsRoot } from "@dockerlocal/shared";
import { ApiError } from "@/api/http";
import { fsApi } from "@/api/fs.api";
import { useFileBrowser } from "@/composables/useFileBrowser";
import EmptyState from "@/components/common/EmptyState.vue";
import ErrorBanner from "@/components/common/ErrorBanner.vue";

const { open } = useFileBrowser();

const roots = ref<FsRoot[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const lastPicked = ref<string | null>(null);

const newRootPath = ref("");
const adding = ref(false);
const addError = ref<string | null>(null);
const removing = ref<string | null>(null);

async function loadRoots(): Promise<void> {
  loading.value = true;
  try {
    roots.value = await fsApi.roots();
    error.value = null;
  } catch (err) {
    error.value = err instanceof Error ? err.message : "Falha ao carregar raízes";
  } finally {
    loading.value = false;
  }
}

async function pickNewRoot(): Promise<void> {
  const picked = await open({ mode: "dir", title: "Escolha uma pasta para adicionar como raiz" });
  if (picked) newRootPath.value = picked;
}

async function addRoot(): Promise<void> {
  const path = newRootPath.value.trim();
  if (!path) return;

  adding.value = true;
  addError.value = null;
  try {
    await fsApi.addRoot(path);
    newRootPath.value = "";
    await loadRoots();
  } catch (err) {
    addError.value =
      err instanceof ApiError
        ? errorWithMirrorHint(err)
        : "Falha ao adicionar raiz";
  } finally {
    adding.value = false;
  }
}

// Rodando em container, "caminho não encontrado" quase sempre é o bind
// espelhado faltando esse caminho do lado de dentro — não um typo do
// usuário. Vale mais explicar isso do que só repetir o 404 cru.
function errorWithMirrorHint(err: ApiError): string {
  if (err.statusCode !== 404) return err.message;
  return `${err.message}. Se o DockerLocal estiver rodando em container, confirme que este caminho está dentro do bind espelhado (PROJECTS_ROOT no .env do docker-compose.yml) — ele precisa existir no MESMO caminho absoluto dos dois lados.`;
}

async function removeRoot(root: FsRoot): Promise<void> {
  removing.value = root.path;
  addError.value = null;
  try {
    await fsApi.removeRoot(root.path);
    await loadRoots();
  } catch (err) {
    addError.value = err instanceof ApiError ? err.message : "Falha ao remover raiz";
  } finally {
    removing.value = null;
  }
}

async function testBrowser(): Promise<void> {
  const picked = await open({ mode: "compose", title: "Escolha um docker-compose.yml" });
  lastPicked.value = picked;
}

onMounted(() => {
  void loadRoots();
});
</script>

<template>
  <div class="flex flex-col gap-4">
    <h1 class="page-title flex items-center gap-2">
      <Icon icon="lucide:settings" class="h-4.5 w-4.5 text-slate-400" />
      Configurações
    </h1>

    <section class="card-surface flex flex-col gap-3 rounded-app-lg border border-slate-200/80 p-4 dark:border-slate-800">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold text-slate-800 dark:text-slate-100">Raízes do file browser</h2>
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-app-sm px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          @click="testBrowser"
        >
          <Icon icon="lucide:folder-open" class="h-3.5 w-3.5" />
          Abrir seletor de arquivo
        </button>
      </div>
      <p class="text-xs text-slate-500">
        Raízes fixas vêm de <code class="font-mono">FS_ROOTS</code> no <code class="font-mono">.env</code> da API.
        Raízes adicionadas aqui ficam salvas em <code class="font-mono">~/.dockerlocal/config.json</code> e valem
        imediatamente, sem reiniciar o processo.
      </p>

      <ErrorBanner v-if="error" :message="error" />

      <EmptyState v-else-if="!loading && roots.length === 0" message="Nenhuma raiz configurada." icon="lucide:folder-tree" />

      <ul v-else class="flex flex-col gap-1.5">
        <li
          v-for="root in roots"
          :key="root.path"
          class="flex items-center gap-2 rounded-app-sm border border-slate-200 px-3 py-2 text-sm dark:border-slate-800"
        >
          <Icon icon="lucide:house" class="h-4 w-4 shrink-0 text-slate-400" />
          <span class="font-medium">{{ root.label }}</span>
          <span class="min-w-0 flex-1 truncate font-mono text-xs text-slate-500">{{ root.path }}</span>
          <span
            class="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium"
            :class="
              root.source === 'env'
                ? 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
            "
          >
            {{ root.source === "env" ? ".env" : "runtime" }}
          </span>
          <button
            v-if="root.source === 'runtime'"
            type="button"
            class="shrink-0 rounded-app-sm p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-red-950"
            :disabled="removing === root.path"
            title="Remover raiz"
            @click="removeRoot(root)"
          >
            <Icon icon="lucide:trash-2" class="h-3.5 w-3.5" />
          </button>
          <button
            v-else
            type="button"
            class="shrink-0 cursor-not-allowed rounded-app-sm p-1 text-slate-300 dark:text-slate-700"
            disabled
            title="Definida no .env — edite o .env e reinicie para remover"
          >
            <Icon icon="lucide:trash-2" class="h-3.5 w-3.5" />
          </button>
        </li>
      </ul>

      <form class="mt-1 flex flex-col gap-2 border-t border-slate-200 pt-3 dark:border-slate-800" @submit.prevent="addRoot">
        <label class="text-xs font-medium text-slate-600 dark:text-slate-300">Adicionar raiz</label>
        <div class="flex items-center gap-2">
          <input
            v-model="newRootPath"
            type="text"
            placeholder="/home/wesley/Documents/outra-pasta"
            class="min-w-0 flex-1 rounded-app-sm border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
          <button
            type="button"
            class="flex shrink-0 items-center gap-1.5 rounded-app-sm px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            @click="pickNewRoot"
          >
            <Icon icon="lucide:folder-open" class="h-3.5 w-3.5" />
            Escolher pasta
          </button>
          <button
            type="submit"
            class="flex shrink-0 items-center gap-1.5 rounded-app-sm bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-slate-300"
            :disabled="adding || !newRootPath.trim()"
          >
            <Icon icon="lucide:plus" class="h-3.5 w-3.5" />
            Adicionar
          </button>
        </div>
        <ErrorBanner v-if="addError" :message="addError" />
      </form>

      <p v-if="lastPicked" class="text-xs text-slate-500">
        Último arquivo escolhido: <span class="font-mono">{{ lastPicked }}</span>
      </p>
    </section>
  </div>
</template>
