<script setup lang="ts">
import { useContainersStore } from "@/stores/containers.store";
import { useResourcePolling } from "@/composables/useResourcePolling";
import ResourceTable from "@/components/common/ResourceTable.vue";
import StateBadge from "@/components/common/StateBadge.vue";
import RelativeTime from "@/components/common/RelativeTime.vue";
import ActionButtons from "@/components/common/ActionButtons.vue";
import EmptyState from "@/components/common/EmptyState.vue";
import ErrorBanner from "@/components/common/ErrorBanner.vue";

const store = useContainersStore();

useResourcePolling(() => store.fetch(true));

function formatPorts(ports: { public?: number; private: number }[]): string {
  if (ports.length === 0) return "—";
  return ports
    .map((p) => (p.public ? `${p.public}→${p.private}` : `${p.private}`))
    .join(", ");
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <h1 class="text-lg font-semibold">Containers</h1>
      <span class="text-xs text-neutral-500">{{ store.items.length }} no total</span>
    </div>

    <ErrorBanner v-if="store.error" :message="store.error" />

    <EmptyState
      v-else-if="!store.loading && store.items.length === 0"
      message="Nenhum container encontrado."
    />

    <div v-else class="overflow-x-auto rounded border border-neutral-200 dark:border-neutral-800">
      <ResourceTable :items="store.items" :row-key="(c) => c.id" :pending="store.pending">
        <template #header>
          <th class="px-3 py-2">Nome</th>
          <th class="px-3 py-2">Imagem</th>
          <th class="px-3 py-2">Estado</th>
          <th class="px-3 py-2">Portas</th>
          <th class="px-3 py-2">Criado</th>
          <th class="px-3 py-2">Projeto</th>
          <th class="px-3 py-2">Ações</th>
        </template>
        <template #row="{ item, pending }">
          <td class="px-3 py-2 font-medium">{{ item.name }}</td>
          <td class="px-3 py-2 text-neutral-500">{{ item.image }}</td>
          <td class="px-3 py-2"><StateBadge :state="item.state" /></td>
          <td class="px-3 py-2 text-neutral-500">{{ formatPorts(item.ports) }}</td>
          <td class="px-3 py-2 text-neutral-500"><RelativeTime :timestamp="item.createdAt" /></td>
          <td class="px-3 py-2 text-neutral-500">{{ item.compose?.project ?? "—" }}</td>
          <td class="px-3 py-2">
            <ActionButtons :container="item" :pending="pending" />
          </td>
        </template>
      </ResourceTable>
    </div>
  </div>
</template>
