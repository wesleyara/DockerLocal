<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import type { ContainerSummary } from "@dockerlocal/shared";
import { Icon } from "@iconify/vue";
import { useContainersStore } from "@/stores/containers.store";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import { ApiError } from "@/api/http";

const props = defineProps<{
  project: string;
  label: string;
  items: ContainerSummary[];
}>();

const store = useContainersStore();
const router = useRouter();
const { confirm } = useConfirm();
const toast = useToast();

const busy = ref(false);

const startable = computed(() => props.items.filter((c) => c.state !== "running"));
const stoppable = computed(() => props.items.filter((c) => c.state === "running"));

function openLogs(): void {
  router.push({
    name: "containers-group-logs",
    query: { ids: props.items.map((c) => c.id).join(","), project: props.label },
  });
}

function reportFailures(results: PromiseSettledResult<unknown>[], verb: string): void {
  const failed = results.filter((r) => r.status === "rejected").length;
  if (failed > 0) toast.error(`${failed} container(es) falharam ao ${verb}.`);
}

async function startAll(): Promise<void> {
  busy.value = true;
  try {
    const results = await Promise.allSettled(startable.value.map((c) => store.act(c.id, "start")));
    reportFailures(results, "iniciar");
  } finally {
    busy.value = false;
  }
}

async function stopAll(): Promise<void> {
  busy.value = true;
  try {
    const results = await Promise.allSettled(stoppable.value.map((c) => store.act(c.id, "stop")));
    reportFailures(results, "parar");
  } finally {
    busy.value = false;
  }
}

async function removeAll(): Promise<void> {
  const ok = await confirm({
    title: "Remover grupo",
    message: `Remover os ${props.items.length} containers de "${props.label}"? Essa ação não pode ser desfeita.`,
    confirmLabel: "Remover todos",
  });
  if (!ok) return;

  busy.value = true;
  const conflicted: ContainerSummary[] = [];
  try {
    const results = await Promise.allSettled(props.items.map((c) => store.act(c.id, "remove")));
    results.forEach((result, i) => {
      if (result.status === "rejected" && result.reason instanceof ApiError && result.reason.canForce) {
        conflicted.push(props.items[i]);
      }
    });
  } finally {
    busy.value = false;
  }

  if (conflicted.length === 0) {
    toast.success(`${props.items.length} container(es) removidos.`);
    return;
  }

  const forceOk = await confirm({
    title: "Containers em uso",
    message: `${conflicted.length} container(es) não puderam ser removidos por estarem em uso. Forçar a remoção pode deixar containers órfãos se a imagem estiver em uso.`,
    confirmLabel: "Forçar remoção",
  });
  if (!forceOk) return;

  busy.value = true;
  try {
    await Promise.allSettled(conflicted.map((c) => store.act(c.id, "remove", { force: true })));
    toast.success(`${conflicted.length} container(es) removidos à força.`);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="flex items-center gap-1" @click.stop>
    <button
      title="Ver logs agregados do grupo"
      class="flex items-center gap-1 rounded-app-sm px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
      :disabled="busy || items.length === 0"
      @click="openLogs"
    >
      <Icon icon="lucide:scroll-text" class="h-3.5 w-3.5" />
      Logs
    </button>
    <button
      v-if="startable.length > 0"
      :title="`Iniciar ${startable.length} container(es) parados`"
      class="flex items-center gap-1 rounded-app-sm px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 dark:text-emerald-400 dark:hover:bg-emerald-950"
      :disabled="busy"
      @click="startAll"
    >
      <Icon icon="lucide:play" class="h-3.5 w-3.5" />
      Iniciar todos
    </button>
    <button
      v-if="stoppable.length > 0"
      :title="`Parar ${stoppable.length} container(es) em execução`"
      class="flex items-center gap-1 rounded-app-sm px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-40 dark:text-amber-400 dark:hover:bg-amber-950"
      :disabled="busy"
      @click="stopAll"
    >
      <Icon icon="lucide:square" class="h-3.5 w-3.5" />
      Parar todos
    </button>
    <button
      title="Remover todos os containers do grupo permanentemente"
      class="flex items-center gap-1 rounded-app-sm px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-40 dark:text-red-400 dark:hover:bg-red-950"
      :disabled="busy || items.length === 0"
      @click="removeAll"
    >
      <Icon icon="lucide:trash-2" class="h-3.5 w-3.5" />
      Remover todos
    </button>
  </div>
</template>
