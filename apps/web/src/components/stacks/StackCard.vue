<script setup lang="ts">
import { computed } from "vue";
import type { StackStatus, StackSummary } from "@dockerlocal/shared";
import { Icon } from "@iconify/vue";
import { useStacksStore } from "@/stores/stacks.store";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import SelfBadge from "@/components/common/SelfBadge.vue";

const props = defineProps<{ stack: StackSummary }>();

const store = useStacksStore();
const { confirm } = useConfirm();
const toast = useToast();

const busy = computed(() => store.pending.has(props.stack.project));

const statusTone: Record<StackStatus, string> = {
  running: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  partial: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  stopped: "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
};

const statusIcon: Record<StackStatus, string> = {
  running: "lucide:play",
  partial: "lucide:triangle-alert",
  stopped: "lucide:square",
};

async function run(action: "up" | "down" | "restart"): Promise<void> {
  try {
    await store.act(props.stack.project, action);
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Falha ao executar ação");
  }
}

async function handleDown(): Promise<void> {
  const ok = await confirm({
    title: `Derrubar "${props.stack.project}"`,
    message: "Isso para e remove os containers da stack. Os volumes são preservados a menos que você marque destruí-los.",
    confirmLabel: "Derrubar",
  });
  if (!ok) return;
  await run("down");
}

async function handleDownWithVolumes(): Promise<void> {
  const ok = await confirm({
    title: `Derrubar "${props.stack.project}" e destruir volumes`,
    message: "Isso remove containers E volumes — dados persistidos (bancos, uploads) são perdidos permanentemente.",
    confirmLabel: "Destruir tudo",
    requireTypedName: props.stack.project,
  });
  if (!ok) return;

  try {
    await store.act(props.stack.project, "down", { volumes: true });
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Falha ao derrubar stack");
  }
}

async function handleRemoveFromRegistry(): Promise<void> {
  const ok = await confirm({
    title: "Esquecer stack",
    message: `Remover "${props.stack.project}" do registry? Ela some da lista até aparecer de novo no discovery.`,
    confirmLabel: "Esquecer",
  });
  if (!ok) return;
  await store.removeFromRegistry(props.stack.project);
}
</script>

<template>
  <div class="card-surface flex flex-col gap-3 rounded-app-lg border border-slate-200/80 p-4 dark:border-slate-800">
    <div class="flex items-start justify-between gap-2">
      <div class="min-w-0">
        <router-link
          :to="`/stacks/${stack.project}`"
          class="flex items-center gap-2 text-sm font-semibold hover:underline"
        >
          <Icon icon="lucide:boxes" class="h-4 w-4 shrink-0 text-slate-400" />
          <span class="truncate">{{ stack.project }}</span>
        </router-link>
        <SelfBadge v-if="stack.isSelf" class="mt-1" />
        <p class="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400" :title="stack.workingDir">
          {{ stack.workingDir || "sem working dir conhecido" }}
        </p>
      </div>
      <span
        class="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
        :class="statusTone[stack.status]"
      >
        <Icon :icon="statusIcon[stack.status]" class="h-3 w-3" />
        {{ stack.runningCount }}/{{ stack.containerCount }}
      </span>
    </div>

    <div class="flex flex-wrap items-center gap-1.5">
      <span
        class="rounded-full px-2 py-0.5 text-[11px] font-medium"
        :class="
          stack.source === 'discovered'
            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
            : 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
        "
      >
        {{ stack.source === "discovered" ? "descoberta" : "registry" }}
      </span>
      <span
        v-if="!stack.fileExists"
        class="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-900/40 dark:text-red-300"
        title="O compose file conhecido não existe mais nesse caminho"
      >
        <Icon icon="lucide:file-x" class="h-3 w-3" />
        arquivo ausente
      </span>
      <span class="text-[11px] text-slate-500">{{ stack.serviceCount }} serviço(s)</span>
    </div>

    <div class="mt-auto flex flex-wrap items-center gap-1 border-t border-slate-100 pt-3 dark:border-slate-800">
      <Icon v-if="busy" icon="lucide:loader-2" class="h-4 w-4 animate-spin text-slate-400" />
      <template v-else>
        <button
          title="Subir a stack (docker compose up -d)"
          class="flex items-center gap-1 rounded-app-sm px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 dark:text-emerald-400 dark:hover:bg-emerald-950"
          :disabled="!stack.fileExists"
          @click="run('up')"
        >
          <Icon icon="lucide:play" class="h-3.5 w-3.5" />
          Up
        </button>
        <button
          v-if="stack.runningCount > 0"
          :disabled="stack.isSelf"
          :title="stack.isSelf ? 'Não é possível reiniciar a própria stack do DockerLocal' : 'Reiniciar serviços'"
          class="flex items-center gap-1 rounded-app-sm px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent dark:text-blue-400 dark:hover:bg-blue-950"
          @click="run('restart')"
        >
          <Icon icon="lucide:rotate-cw" class="h-3.5 w-3.5" />
          Restart
        </button>
        <button
          v-if="stack.containerCount > 0"
          :disabled="stack.isSelf"
          :title="stack.isSelf ? 'Não é possível derrubar a própria stack do DockerLocal' : 'Derrubar a stack'"
          class="flex items-center gap-1 rounded-app-sm px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent dark:text-amber-400 dark:hover:bg-amber-950"
          @click="handleDown"
        >
          <Icon icon="lucide:square" class="h-3.5 w-3.5" />
          Down
        </button>
        <button
          :disabled="stack.isSelf"
          :title="stack.isSelf ? 'Não é possível derrubar a própria stack do DockerLocal' : 'Derrubar e destruir volumes — irreversível'"
          class="flex items-center gap-1 rounded-app-sm px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent dark:text-red-400 dark:hover:bg-red-950"
          @click="handleDownWithVolumes"
        >
          <Icon icon="lucide:trash-2" class="h-3.5 w-3.5" />
          Down -v
        </button>
        <button
          v-if="stack.source === 'registry'"
          title="Esquecer esta stack do registry"
          class="ml-auto flex items-center gap-1 rounded-app-sm px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          @click="handleRemoveFromRegistry"
        >
          <Icon icon="lucide:eraser" class="h-3.5 w-3.5" />
          Esquecer
        </button>
      </template>
    </div>
  </div>
</template>
