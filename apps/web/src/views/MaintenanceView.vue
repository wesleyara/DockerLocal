<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { Icon } from "@iconify/vue";
import type { PruneTarget } from "@dockerlocal/shared";
import { useSystemStore } from "@/stores/system.store";
import { useStacksStore } from "@/stores/stacks.store";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import { formatBytes } from "@/utils/format";
import ErrorBanner from "@/components/common/ErrorBanner.vue";

interface CategoryCard {
  target: PruneTarget;
  icon: string;
  title: string;
  hint: string;
}

const CARDS: CategoryCard[] = [
  { target: "containers", icon: "lucide:box", title: "Containers", hint: "Containers parados." },
  { target: "images", icon: "lucide:layers", title: "Images", hint: "Imagens sem container usando-as." },
  { target: "volumes", icon: "lucide:database", title: "Volumes", hint: "Volumes sem container montando-os." },
  { target: "buildCache", icon: "lucide:hammer", title: "Build cache", hint: "Camadas de build não usadas por nenhuma imagem." },
];

const store = useSystemStore();
const stacksStore = useStacksStore();
const { confirm } = useConfirm();
const toast = useToast();

const selfStack = computed(() => stacksStore.items.find((s) => s.isSelf));
const rebuildingSelf = ref(false);

async function rebuildSelf(): Promise<void> {
  const ok = await confirm({
    title: "Rebuildar o próprio DockerLocal",
    message:
      "Builda a imagem do DockerLocal e troca o container rodando por um novo, a partir dela. " +
      "O app fica fora do ar por alguns segundos durante a troca — a conexão desta página vai cair sozinha " +
      "nesse momento (é esperado, não uma falha). Recarregue a página depois de ~30s para voltar a usar a versão nova.",
    confirmLabel: "Rebuildar",
    requireTypedName: "rebuild",
  });
  if (!ok) return;

  rebuildingSelf.value = true;
  try {
    await stacksStore.selfRebuild();
    toast.info("Build iniciado — acompanhe pela task. A página vai perder conexão quando o container for trocado.");
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Falha ao iniciar o rebuild");
  } finally {
    rebuildingSelf.value = false;
  }
}

const selected = reactive<Record<PruneTarget, boolean>>({
  containers: false,
  images: false,
  volumes: false,
  buildCache: false,
});

// Espelham as opções que já existem por página (dangling-only vs. tudo).
const imagesAll = reactive({ value: false });
const volumesAll = reactive({ value: false });

const selectedTargets = computed(() => CARDS.map((c) => c.target).filter((t) => selected[t]));
const selectedReclaimable = computed(() =>
  selectedTargets.value.reduce((sum, t) => sum + (store.diskUsage?.[t].reclaimable ?? 0), 0),
);

function toggleAll(): void {
  const allOn = CARDS.every((c) => selected[c.target]);
  for (const c of CARDS) selected[c.target] = !allOn;
}

async function pruneSelected(): Promise<void> {
  const targets = selectedTargets.value;
  if (targets.length === 0) return;

  const ok = await confirm({
    title: "Limpar recursos não utilizados",
    message: `Remove permanentemente os recursos não utilizados de: ${targets
      .map((t) => CARDS.find((c) => c.target === t)!.title)
      .join(", ")}. Essa ação não pode ser desfeita.`,
    confirmLabel: "Limpar",
    requireTypedName: "prune",
  });
  if (!ok) return;

  try {
    const result = await store.prune(targets, {
      imagesAll: imagesAll.value,
      volumesAll: volumesAll.value,
    });
    toast.success(`Espaço liberado: ${formatBytes(result.totalSpaceReclaimed)}.`);
    for (const t of targets) selected[t] = false;
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Falha ao limpar recursos");
  }
}

async function pruneOne(target: PruneTarget): Promise<void> {
  const card = CARDS.find((c) => c.target === target)!;
  const ok = await confirm({
    title: `Limpar ${card.title.toLowerCase()}`,
    message: `${card.hint} Essa ação não pode ser desfeita.`,
    confirmLabel: "Limpar",
    requireTypedName: "prune",
  });
  if (!ok) return;

  try {
    const result = await store.prune([target], {
      imagesAll: imagesAll.value,
      volumesAll: volumesAll.value,
    });
    toast.success(`Espaço liberado: ${formatBytes(result.totalSpaceReclaimed)}.`);
  } catch (err) {
    toast.error(err instanceof Error ? err.message : `Falha ao limpar ${card.title.toLowerCase()}`);
  }
}

onMounted(() => {
  void store.fetchDiskUsage();
  void stacksStore.fetch();
});
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <h1 class="page-title flex items-center gap-2">
        <Icon icon="lucide:sparkles" class="h-4.5 w-4.5 text-slate-400" />
        Manutenção
      </h1>
      <button
        type="button"
        class="flex items-center gap-1.5 rounded-app-sm px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
        :disabled="store.loading"
        @click="store.fetchDiskUsage()"
      >
        <Icon icon="lucide:refresh-cw" class="h-3.5 w-3.5" :class="{ 'animate-spin': store.loading }" />
        Atualizar
      </button>
    </div>

    <p class="text-xs text-slate-500">
      Escolha o que limpar e clique em <span class="font-medium">Limpar selecionados</span>, ou use o botão de cada
      cartão para uma limpeza isolada. Só recursos não utilizados são removidos — nada em uso é afetado.
    </p>

    <ErrorBanner v-if="store.error" :message="store.error" />

    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label
        v-for="card in CARDS"
        :key="card.target"
        class="card-surface flex cursor-pointer flex-col gap-2 rounded-app-lg border border-slate-200/80 p-4 has-checked:border-[var(--color-accent)] dark:border-slate-800"
      >
        <div class="flex items-center justify-between">
          <span class="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
            <Icon :icon="card.icon" class="h-4 w-4 text-slate-400" />
            {{ card.title }}
          </span>
          <input v-model="selected[card.target]" type="checkbox" class="h-4 w-4 accent-[var(--color-accent)]" />
        </div>

        <p class="text-xs text-slate-500">{{ card.hint }}</p>

        <div class="mt-1 flex items-baseline gap-1.5">
          <span class="text-lg font-semibold text-slate-900 dark:text-slate-50">
            {{ formatBytes(store.diskUsage?.[card.target].reclaimable ?? 0) }}
          </span>
          <span class="text-xs text-slate-500">recuperável</span>
        </div>
        <p class="text-[11px] text-slate-400">
          {{ store.diskUsage?.[card.target].count ?? 0 }} no total ·
          {{ formatBytes(store.diskUsage?.[card.target].size ?? 0) }} ocupados
        </p>

        <label
          v-if="card.target === 'images'"
          class="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500"
          @click.stop
        >
          <input v-model="imagesAll.value" type="checkbox" class="h-3.5 w-3.5 accent-[var(--color-accent)]" />
          Todas as não usadas (não só dangling)
        </label>
        <label
          v-else-if="card.target === 'volumes'"
          class="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500"
          @click.stop
        >
          <input v-model="volumesAll.value" type="checkbox" class="h-3.5 w-3.5 accent-[var(--color-accent)]" />
          Incluir volumes nomeados
        </label>

        <button
          type="button"
          class="mt-2 flex items-center justify-center gap-1.5 rounded-app-sm border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          :disabled="store.pruning || (store.diskUsage?.[card.target].count ?? 0) === 0"
          @click.prevent.stop="pruneOne(card.target)"
        >
          <Icon icon="lucide:trash-2" class="h-3.5 w-3.5" />
          Limpar agora
        </button>
      </label>
    </div>

    <div
      class="card-surface sticky bottom-3 flex flex-col gap-3 rounded-app-lg border border-slate-200/80 p-4 shadow-[var(--shadow-elevated)] sm:flex-row sm:items-center sm:justify-between dark:border-slate-800"
    >
      <div class="flex items-center gap-3">
        <button
          type="button"
          class="rounded-app-sm px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          @click="toggleAll"
        >
          Selecionar tudo
        </button>
        <span class="text-xs text-slate-500">
          {{ selectedTargets.length }} categoria(s) selecionada(s) ·
          <span class="font-medium text-slate-700 dark:text-slate-200">{{ formatBytes(selectedReclaimable) }}</span>
          estimado(s)
        </span>
      </div>
      <button
        type="button"
        class="flex items-center justify-center gap-1.5 rounded-app-sm bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-40"
        :disabled="store.pruning || selectedTargets.length === 0"
        @click="pruneSelected"
      >
        <Icon icon="lucide:sparkles" class="h-3.5 w-3.5" />
        Limpar selecionados
      </button>
    </div>

    <section class="card-surface flex flex-col gap-3 rounded-app-lg border border-slate-200/80 p-4 dark:border-slate-800">
      <h2 class="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
        <Icon icon="lucide:refresh-cw-off" class="h-4 w-4 text-slate-400" />
        DockerLocal
      </h2>
      <p class="text-xs text-slate-500">
        Builda a imagem <span class="font-mono">{{ selfStack?.project ?? "dockerlocal" }}</span> a partir do código
        atual e troca o container rodando por um novo, a partir dela — sem precisar de terminal. A troca sobe
        num container auxiliar descartável e sobrevive à queda deste processo; a página perde a conexão durante
        alguns segundos enquanto o container é recriado, o que é esperado.
      </p>
      <button
        type="button"
        class="flex w-fit items-center gap-1.5 rounded-app-sm border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        :disabled="rebuildingSelf"
        title="docker compose build && docker compose up -d --force-recreate na própria stack"
        @click="rebuildSelf"
      >
        <Icon icon="lucide:hammer" class="h-3.5 w-3.5" />
        Rebuildar DockerLocal
      </button>
    </section>
  </div>
</template>
