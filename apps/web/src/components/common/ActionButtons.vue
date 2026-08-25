<script setup lang="ts">
import type { ContainerSummary } from "@dockerlocal/shared";
import { Icon } from "@iconify/vue";
import { useContainersStore } from "@/stores/containers.store";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import { ApiError } from "@/api/http";

const props = withDefaults(
  defineProps<{
    container: ContainerSummary;
    pending: boolean;
    showLogsLink?: boolean;
  }>(),
  { showLogsLink: true },
);

const emit = defineEmits<{ removed: [] }>();

const store = useContainersStore();
const { confirm } = useConfirm();
const toast = useToast();

async function run(action: "start" | "stop" | "restart"): Promise<void> {
  try {
    await store.act(props.container.id, action);
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Falha ao executar ação");
  }
}

async function handleRemove(): Promise<void> {
  const ok = await confirm({
    title: "Remover container",
    message: `Remover "${props.container.name}"? Essa ação não pode ser desfeita.`,
    confirmLabel: "Remover",
  });
  if (!ok) return;

  try {
    await store.act(props.container.id, "remove");
    toast.success(`Container "${props.container.name}" removido.`);
    emit("removed");
  } catch (err) {
    if (err instanceof ApiError && err.canForce) {
      const forceOk = await confirm({
        title: "Container em uso",
        message: `${err.message} Forçar a remoção pode deixar um container órfão se a imagem estiver em uso.`,
        confirmLabel: "Remover mesmo assim",
      });
      if (forceOk) {
        try {
          await store.act(props.container.id, "remove", { force: true });
          toast.success(`Container "${props.container.name}" removido.`);
          emit("removed");
        } catch (forceErr) {
          toast.error(forceErr instanceof Error ? forceErr.message : "Falha ao remover container");
        }
      }
    } else {
      toast.error(err instanceof Error ? err.message : "Falha ao remover container");
    }
  }
}
</script>

<template>
  <div class="flex items-center gap-1">
    <router-link
      v-if="showLogsLink"
      :to="`/containers/${container.id}/logs`"
      title="Ver logs em tempo real"
      class="flex items-center gap-1 rounded-app-sm px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
    >
      <Icon icon="lucide:scroll-text" class="h-3.5 w-3.5" />
      Logs
    </router-link>

    <Icon v-if="pending" icon="lucide:loader-2" class="h-4 w-4 animate-spin text-slate-400" />

    <template v-else>
      <button
        v-if="container.state !== 'running'"
        title="Iniciar container"
        class="flex items-center gap-1 rounded-app-sm px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950"
        @click="run('start')"
      >
        <Icon icon="lucide:play" class="h-3.5 w-3.5" />
        Iniciar
      </button>
      <button
        v-if="container.state === 'running'"
        title="Parar container — encerra os processos dentro dele"
        class="flex items-center gap-1 rounded-app-sm px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950"
        @click="run('stop')"
      >
        <Icon icon="lucide:square" class="h-3.5 w-3.5" />
        Parar
      </button>
      <button
        v-if="container.state === 'running'"
        title="Reiniciar container"
        class="flex items-center gap-1 rounded-app-sm px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950"
        @click="run('restart')"
      >
        <Icon icon="lucide:rotate-cw" class="h-3.5 w-3.5" />
        Reiniciar
      </button>
      <button
        title="Remover container permanentemente"
        class="flex items-center gap-1 rounded-app-sm px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
        @click="handleRemove"
      >
        <Icon icon="lucide:trash-2" class="h-3.5 w-3.5" />
        Remover
      </button>
    </template>
  </div>
</template>
