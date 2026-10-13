<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { Icon } from "@iconify/vue";
import type { AutostopState } from "@dockerlocal/shared";
import { ApiError } from "@/api/http";
import { autostopApi } from "@/api/autostop.api";
import { useContainersStore } from "@/stores/containers.store";
import { useResourcePolling } from "@/composables/useResourcePolling";
import { useConfirm } from "@/composables/useConfirm";
import EmptyState from "@/components/common/EmptyState.vue";
import ErrorBanner from "@/components/common/ErrorBanner.vue";
import SelfBadge from "@/components/common/SelfBadge.vue";
import StateBadge from "@/components/common/StateBadge.vue";

const containers = useContainersStore();
const { confirm } = useConfirm();
useResourcePolling(() => containers.fetch(true));

const state = ref<AutostopState | null>(null);
const error = ref<string | null>(null);
const busy = ref(false);

const excluded = computed(() => new Set(state.value?.excluded ?? []));
const knownNames = computed(() => new Set(containers.items.map((c) => c.name)));
const orphans = computed(() => (state.value?.excluded ?? []).filter((n) => !knownNames.value.has(n)));

function fail(err: unknown, fallback: string): void {
  error.value = err instanceof ApiError || err instanceof Error ? err.message : fallback;
}

async function load(): Promise<void> {
  try {
    state.value = await autostopApi.get();
    error.value = null;
  } catch (err) {
    fail(err, "Falha ao carregar auto-stop");
  }
}

async function mutate(fn: () => Promise<AutostopState>): Promise<void> {
  busy.value = true;
  try {
    state.value = await fn();
    error.value = null;
  } catch (err) {
    fail(err, "Falha ao salvar");
  } finally {
    busy.value = false;
  }
}

function toggleExcluded(name: string, keep: boolean): Promise<void> {
  return mutate(() => (keep ? autostopApi.add(name) : autostopApi.remove(name)));
}

async function runNow(): Promise<void> {
  const ok = await confirm({
    title: "Executar auto-stop agora?",
    message:
      "Todos os containers em execução, exceto o DockerLocal e os da lista, serão parados.",
    confirmLabel: "Parar agora",
  });
  if (!ok) return;
  busy.value = true;
  try {
    await autostopApi.run();
    await Promise.all([load(), containers.fetch(true)]);
  } catch (err) {
    fail(err, "Falha ao executar");
  } finally {
    busy.value = false;
  }
}

onMounted(() => void load());
</script>

<template>
  <div class="flex flex-col gap-4">
    <h1 class="page-title flex items-center gap-2">
      <Icon icon="lucide:power" class="h-4.5 w-4.5 text-slate-400" />
      Auto-stop no boot
    </h1>

    <ErrorBanner v-if="error" :message="error" />

    <section
      v-if="state"
      class="card-surface flex flex-col gap-3 rounded-app-lg border border-slate-200/80 p-4 dark:border-slate-800"
    >
      <div class="flex flex-wrap items-center justify-between gap-2">
        <label class="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            :checked="state.enabled"
            :disabled="busy"
            @change="mutate(() => autostopApi.setEnabled(($event.target as HTMLInputElement).checked))"
          />
          Parar containers ao ligar a máquina
        </label>
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-app-sm px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800"
          :disabled="busy"
          @click="runNow"
        >
          <Icon icon="lucide:play" class="h-3.5 w-3.5" />
          Executar agora
        </button>
      </div>
      <p class="text-xs text-slate-500">
        No boot da máquina, todos os containers são parados, exceto o DockerLocal e os marcados abaixo.
        Reiniciar só o DockerLocal não dispara nada.
      </p>

      <p v-if="state.lastRun" class="text-xs text-slate-500">
        Última execução ({{ state.lastRun.trigger === "boot" ? "boot" : "manual" }}):
        {{ new Date(state.lastRun.at).toLocaleString() }} —
        {{ state.lastRun.stopped.filter((s) => s.ok).length }} parados,
        {{ state.lastRun.stopped.filter((s) => !s.ok).length }} com falha.
      </p>
    </section>

    <section
      class="card-surface flex flex-col gap-2 rounded-app-lg border border-slate-200/80 p-4 dark:border-slate-800"
    >
      <h2 class="text-sm font-semibold text-slate-800 dark:text-slate-100">Não parar no boot</h2>

      <EmptyState
        v-if="!containers.loading && containers.items.length === 0"
        message="Nenhum container."
        icon="lucide:box"
      />

      <ul v-else class="flex flex-col gap-1.5">
        <li
          v-for="c in containers.items"
          :key="c.id"
          class="flex items-center gap-3 rounded-app-sm border border-slate-200 px-3 py-2 text-sm dark:border-slate-800"
        >
          <input
            type="checkbox"
            :checked="c.isSelf || excluded.has(c.name)"
            :disabled="c.isSelf || busy || !state"
            :title="c.isSelf ? 'O DockerLocal nunca é parado' : 'Não parar no boot'"
            @change="toggleExcluded(c.name, ($event.target as HTMLInputElement).checked)"
          />
          <span class="font-medium">{{ c.name }}</span>
          <SelfBadge v-if="c.isSelf" />
          <span class="min-w-0 flex-1 truncate font-mono text-xs text-slate-500">{{ c.image }}</span>
          <StateBadge :state="c.state" />
        </li>
      </ul>

      <div v-if="orphans.length" class="mt-2 flex flex-col gap-1.5 border-t border-slate-200 pt-3 dark:border-slate-800">
        <p class="text-xs text-slate-500">Na lista, mas sem container correspondente:</p>
        <div
          v-for="name in orphans"
          :key="name"
          class="flex items-center gap-2 text-sm"
        >
          <span class="font-mono text-xs">{{ name }}</span>
          <button
            type="button"
            class="rounded-app-sm p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
            title="Remover da lista"
            :disabled="busy"
            @click="toggleExcluded(name, false)"
          >
            <Icon icon="lucide:trash-2" class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </section>
  </div>
</template>
