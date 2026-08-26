<script setup lang="ts">
import { Icon } from "@iconify/vue";
import { useStacksStore } from "@/stores/stacks.store";
import { useResourcePolling } from "@/composables/useResourcePolling";
import StackCard from "@/components/stacks/StackCard.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import ErrorBanner from "@/components/common/ErrorBanner.vue";
import TableSkeleton from "@/components/common/TableSkeleton.vue";

const store = useStacksStore();

useResourcePolling(() => store.fetch(true));
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <h1 class="page-title flex items-center gap-2">
        <Icon icon="lucide:boxes" class="h-4.5 w-4.5 text-slate-400" />
        Stacks
      </h1>
      <span class="text-xs text-slate-500">{{ store.items.length }} no total</span>
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
  </div>
</template>
