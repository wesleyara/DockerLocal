<script setup lang="ts">
import { ref } from "vue";
import { Icon } from "@iconify/vue";
import { useStacksStore } from "@/stores/stacks.store";
import { useResourcePolling } from "@/composables/useResourcePolling";
import StackCard from "@/components/stacks/StackCard.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import ErrorBanner from "@/components/common/ErrorBanner.vue";
import TableSkeleton from "@/components/common/TableSkeleton.vue";
import CreateStackDialog from "./CreateStackDialog.vue";

const store = useStacksStore();
const createDialogOpen = ref(false);

useResourcePolling(() => store.fetch(true));
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <h1 class="page-title flex items-center gap-2">
        <Icon icon="lucide:boxes" class="h-4.5 w-4.5 text-slate-400" />
        Stacks
      </h1>
      <div class="flex items-center gap-3">
        <button
          class="flex items-center gap-1.5 rounded-app-sm bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--color-accent-hover)]"
          title="Subir uma stack a partir de um compose file"
          @click="createDialogOpen = true"
        >
          <Icon icon="lucide:plus" class="h-3.5 w-3.5" />
          Nova stack
        </button>
        <span class="text-xs text-slate-500">{{ store.items.length }} no total</span>
      </div>
    </div>

    <ErrorBanner v-if="store.error" :message="store.error" />

    <TableSkeleton
      v-else-if="store.loading && store.items.length === 0"
      :columns="4"
      class="card-surface overflow-hidden rounded-app-lg border border-slate-200/80 dark:border-slate-800"
    />

    <EmptyState
      v-else-if="!store.loading && store.items.length === 0"
      message="Nenhuma stack encontrada. Suba um docker-compose.yml para ela aparecer aqui."
      icon="lucide:boxes"
    />

    <div v-else class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <StackCard v-for="stack in store.items" :key="stack.project" :stack="stack" />
    </div>

    <CreateStackDialog v-model:open="createDialogOpen" />
  </div>
</template>
