<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { Icon } from "@iconify/vue";
import { useContainersStore } from "@/stores/containers.store";
import { useResourcePolling } from "@/composables/useResourcePolling";
import ContainersTable from "@/components/containers/ContainersTable.vue";
import GroupActionButtons from "@/components/containers/GroupActionButtons.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import ErrorBanner from "@/components/common/ErrorBanner.vue";
import TableSkeleton from "@/components/common/TableSkeleton.vue";

const UNGROUPED_LABEL = "Sem projeto";

const store = useContainersStore();

useResourcePolling(() => store.fetch(true));

const grouped = ref(true);
// Grupos começam colapsados — só entra aqui quando o usuário expande.
const expanded = reactive(new Set<string>());

const groups = computed(() => {
  return [...store.byProject.entries()]
    .map(([project, items]) => ({ project, items }))
    .sort((a, b) => {
      if (a.project === "") return 1;
      if (b.project === "") return -1;
      return a.project.localeCompare(b.project);
    });
});

function toggleCollapsed(project: string): void {
  if (expanded.has(project)) {
    expanded.delete(project);
  } else {
    expanded.add(project);
  }
}

function runningCount(items: { state: string }[]): number {
  return items.filter((i) => i.state === "running").length;
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <h1 class="page-title flex items-center gap-2">
        <Icon icon="lucide:box" class="h-4.5 w-4.5 text-slate-400" />
        Containers
      </h1>
      <div class="flex flex-wrap items-center gap-3 sm:gap-4">
        <label class="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
          <input v-model="grouped" type="checkbox" />
          Agrupar por projeto
        </label>
        <span class="text-xs text-slate-500">{{ store.items.length }} no total</span>
      </div>
    </div>

    <ErrorBanner v-if="store.error" :message="store.error" />

    <TableSkeleton
      v-else-if="store.loading && store.items.length === 0"
      :columns="7"
      class="card-surface overflow-hidden rounded-app-lg border border-slate-200/80 dark:border-slate-800"
    />

    <EmptyState
      v-else-if="!store.loading && store.items.length === 0"
      message="Nenhum container encontrado."
      icon="lucide:box"
    />

    <div v-else-if="grouped" class="flex flex-col gap-3">
      <div
        v-for="group in groups"
        :key="group.project || '__ungrouped__'"
        class="card-surface overflow-hidden rounded-app-lg border border-slate-200/80 dark:border-slate-800"
      >
        <div class="flex w-full flex-wrap items-center gap-x-2 gap-y-1.5 bg-slate-50 px-3 py-2 dark:bg-slate-900">
          <button
            type="button"
            class="flex items-center gap-2 text-left text-sm font-medium hover:underline"
            @click="toggleCollapsed(group.project)"
          >
            <Icon
              icon="lucide:chevron-down"
              class="h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform"
              :class="{ '-rotate-90': !expanded.has(group.project) }"
            />
            <span>{{ group.project || UNGROUPED_LABEL }}</span>
            <span class="text-xs font-normal text-slate-500">
              {{ runningCount(group.items) }}/{{ group.items.length }} rodando
            </span>
          </button>
          <span class="ml-auto overflow-x-auto">
            <GroupActionButtons
              :project="group.project"
              :label="group.project || UNGROUPED_LABEL"
              :items="group.items"
            />
          </span>
        </div>

        <div v-if="expanded.has(group.project)" class="overflow-x-auto">
          <ContainersTable :items="group.items" :pending="store.pending" :show-project-column="false" />
        </div>
      </div>
    </div>

    <div v-else class="card-surface overflow-x-auto rounded-app-lg border border-slate-200/80 dark:border-slate-800">
      <ContainersTable :items="store.items" :pending="store.pending" />
    </div>
  </div>
</template>
