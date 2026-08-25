<script setup lang="ts">
import { ref } from "vue";
import { Icon } from "@iconify/vue";
import { useImagesStore } from "@/stores/images.store";
import { useTasksStore } from "@/stores/tasks.store";
import { useResourcePolling } from "@/composables/useResourcePolling";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import { imagesApi } from "@/api/images.api";
import ImagesTable from "@/components/images/ImagesTable.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import ErrorBanner from "@/components/common/ErrorBanner.vue";
import TableSkeleton from "@/components/common/TableSkeleton.vue";

const store = useImagesStore();
const tasksStore = useTasksStore();
const { confirm } = useConfirm();
const toast = useToast();

useResourcePolling(() => store.fetch(true));

async function pruneDangling(): Promise<void> {
  const ok = await confirm({
    title: "Limpar imagens sem tag",
    message: `Remover ${store.danglingCount} imagem(ns) "dangling"? Essa ação não pode ser desfeita.`,
    confirmLabel: "Limpar",
  });
  if (!ok) return;
  const count = store.danglingCount;
  try {
    await store.prune(true);
    toast.success(`${count} imagem(ns) dangling removida(s).`);
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Falha ao limpar imagens");
  }
}

const pullDialogOpen = ref(false);
const pullRef = ref("");
const pulling = ref(false);

function openPullDialog(): void {
  pullRef.value = "";
  pullDialogOpen.value = true;
}

async function submitPull(): Promise<void> {
  const ref_ = pullRef.value.trim();
  if (!ref_) return;

  pulling.value = true;
  try {
    const { taskId } = await imagesApi.pull(ref_);
    tasksStore.track({
      id: taskId,
      kind: "image-pull",
      label: `pull ${ref_}`,
      status: "running",
      startedAt: Date.now(),
      meta: { ref: ref_ },
    });
    tasksStore.open(taskId);
    pullDialogOpen.value = false;
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Falha ao iniciar pull");
  } finally {
    pulling.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <h1 class="page-title flex items-center gap-2">
        <Icon icon="lucide:layers" class="h-4.5 w-4.5 text-slate-400" />
        Images
      </h1>
      <div class="flex flex-wrap items-center gap-3 sm:gap-4">
        <button
          class="flex items-center gap-1.5 rounded-app-sm bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--color-accent-hover)]"
          title="Puxar uma imagem do registry"
          @click="openPullDialog"
        >
          <Icon icon="lucide:download" class="h-3.5 w-3.5" />
          Pull
        </button>
        <button
          class="flex items-center gap-1.5 rounded-app-sm px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
          :disabled="store.danglingCount === 0"
          title="Remove imagens sem tag (dangling)"
          @click="pruneDangling"
        >
          <Icon icon="lucide:sparkles" class="h-3.5 w-3.5" />
          Limpar dangling ({{ store.danglingCount }})
        </button>
        <span class="text-xs text-slate-500">{{ store.items.length }} no total</span>
      </div>
    </div>

    <ErrorBanner v-if="store.error" :message="store.error" />

    <TableSkeleton
      v-else-if="store.loading && store.items.length === 0"
      :columns="6"
      class="card-surface overflow-hidden rounded-app-lg border border-slate-200/80 dark:border-slate-800"
    />

    <EmptyState
      v-else-if="!store.loading && store.items.length === 0"
      message="Nenhuma imagem encontrada."
      icon="lucide:layers"
    />

    <div v-else class="card-surface overflow-x-auto rounded-app-lg border border-slate-200/80 dark:border-slate-800">
      <ImagesTable :items="store.items" :pending="store.pending" />
    </div>

    <div
      v-if="pullDialogOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      @click.self="pullDialogOpen = false"
    >
      <form
        class="w-full max-w-sm rounded-app-lg border border-slate-200 bg-white p-5 shadow-[var(--shadow-elevated)] dark:border-slate-800 dark:bg-slate-900"
        @submit.prevent="submitPull"
      >
        <h2 class="text-base font-semibold text-slate-900 dark:text-slate-100">Pull de imagem</h2>
        <p class="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Nome e tag da imagem, por exemplo <span class="font-mono">alpine:3.19</span>.
        </p>
        <input
          v-model="pullRef"
          type="text"
          autofocus
          placeholder="alpine:3.19"
          class="mt-3 w-full rounded-app-sm border border-slate-300 px-2 py-1.5 text-sm font-mono dark:border-slate-700 dark:bg-slate-800"
        />
        <div class="mt-5 flex justify-end gap-2">
          <button
            type="button"
            class="rounded-app-sm px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            @click="pullDialogOpen = false"
          >
            Cancelar
          </button>
          <button
            type="submit"
            class="rounded-app-sm bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            :disabled="!pullRef.trim() || pulling"
          >
            Pull
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
