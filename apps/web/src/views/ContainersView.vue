<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { useContainersStore } from "@/stores/containers.store";
import { useResourcePolling } from "@/composables/useResourcePolling";
import ContainersTable from "@/components/containers/ContainersTable.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import ErrorBanner from "@/components/common/ErrorBanner.vue";

const UNGROUPED_LABEL = "Sem projeto";

const store = useContainersStore();

useResourcePolling(() => store.fetch(true));

const grouped = ref(true);
const collapsed = reactive(new Set<string>());

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
  if (collapsed.has(project)) {
    collapsed.delete(project);
  } else {
    collapsed.add(project);
  }
}

function runningCount(items: { state: string }[]): number {
  return items.filter((i) => i.state === "running").length;
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <h1 class="text-lg font-semibold">Containers</h1>
      <div class="flex items-center gap-4">
        <label class="flex items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400">
          <input v-model="grouped" type="checkbox" />
          Agrupar por projeto
        </label>
        <span class="text-xs text-neutral-500">{{ store.items.length }} no total</span>
      </div>
    </div>

    <ErrorBanner v-if="store.error" :message="store.error" />

    <EmptyState
      v-else-if="!store.loading && store.items.length === 0"
      message="Nenhum container encontrado."
    />

    <div v-else-if="grouped" class="flex flex-col gap-3">
      <div
        v-for="group in groups"
        :key="group.project || '__ungrouped__'"
        class="overflow-hidden rounded border border-neutral-200 dark:border-neutral-800"
      >
        <button
          class="flex w-full items-center gap-2 bg-neutral-50 px-3 py-2 text-left text-sm font-medium hover:bg-neutral-100 dark:bg-neutral-900 dark:hover:bg-neutral-800"
          @click="toggleCollapsed(group.project)"
        >
          <svg
            class="h-3 w-3 shrink-0 text-neutral-400 transition-transform"
            :class="{ '-rotate-90': collapsed.has(group.project) }"
            viewBox="0 0 24 24"
            fill="none"
          >
            <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <span>{{ group.project || UNGROUPED_LABEL }}</span>
          <span class="text-xs font-normal text-neutral-500">
            {{ runningCount(group.items) }}/{{ group.items.length }} rodando
          </span>
        </button>

        <div v-if="!collapsed.has(group.project)" class="overflow-x-auto">
          <ContainersTable :items="group.items" :pending="store.pending" :show-project-column="false" />
        </div>
      </div>
    </div>

    <div v-else class="overflow-x-auto rounded border border-neutral-200 dark:border-neutral-800">
      <ContainersTable :items="store.items" :pending="store.pending" />
    </div>
  </div>
</template>
