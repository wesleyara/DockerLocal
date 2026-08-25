<script setup lang="ts">
import type { ContainerSummary } from "@dockerlocal/shared";
import { useContainersStore } from "@/stores/containers.store";
import { useConfirm } from "@/composables/useConfirm";
import { ApiError } from "@/api/http";

const props = defineProps<{
  container: ContainerSummary;
  pending: boolean;
}>();

const store = useContainersStore();
const { confirm } = useConfirm();

async function handleRemove(): Promise<void> {
  const ok = await confirm({
    title: "Remover container",
    message: `Remover "${props.container.name}"? Essa ação não pode ser desfeita.`,
    confirmLabel: "Remover",
  });
  if (!ok) return;

  try {
    await store.act(props.container.id, "remove");
  } catch (err) {
    if (err instanceof ApiError && err.canForce) {
      const forceOk = await confirm({
        title: "Container em uso",
        message: `${err.message} Forçar a remoção pode deixar um container órfão se a imagem estiver em uso.`,
        confirmLabel: "Remover mesmo assim",
      });
      if (forceOk) {
        await store.act(props.container.id, "remove", { force: true });
      }
    } else {
      throw err;
    }
  }
}
</script>

<template>
  <div class="flex items-center gap-1">
    <svg
      v-if="pending"
      class="h-4 w-4 animate-spin text-neutral-400"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>

    <template v-else>
      <button
        v-if="container.state !== 'running'"
        class="rounded px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950"
        @click="store.act(container.id, 'start')"
      >
        Iniciar
      </button>
      <button
        v-if="container.state === 'running'"
        class="rounded px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950"
        @click="store.act(container.id, 'stop')"
      >
        Parar
      </button>
      <button
        v-if="container.state === 'running'"
        class="rounded px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950"
        @click="store.act(container.id, 'restart')"
      >
        Reiniciar
      </button>
      <button
        class="rounded px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
        @click="handleRemove"
      >
        Remover
      </button>
    </template>
  </div>
</template>
