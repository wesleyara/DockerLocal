<script setup lang="ts">
import { onMounted, ref } from "vue";
import { Icon } from "@iconify/vue";
import type { FsRoot } from "@dockerlocal/shared";
import { fsApi } from "@/api/fs.api";
import { useFileBrowser } from "@/composables/useFileBrowser";
import EmptyState from "@/components/common/EmptyState.vue";
import ErrorBanner from "@/components/common/ErrorBanner.vue";

const { open } = useFileBrowser();

const roots = ref<FsRoot[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const lastPicked = ref<string | null>(null);

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
        Configuradas via <code class="font-mono">FS_ROOTS</code> no <code class="font-mono">.env</code> da API.
        Definem exatamente o que o app consegue enxergar no disco.
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
          <span class="min-w-0 truncate font-mono text-xs text-slate-500">{{ root.path }}</span>
        </li>
      </ul>

      <p v-if="lastPicked" class="text-xs text-slate-500">
        Último arquivo escolhido: <span class="font-mono">{{ lastPicked }}</span>
      </p>
    </section>
  </div>
</template>
