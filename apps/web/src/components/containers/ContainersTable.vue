<script setup lang="ts">
import type { ContainerSummary } from "@dockerlocal/shared";
import ResourceTable from "@/components/common/ResourceTable.vue";
import StateBadge from "@/components/common/StateBadge.vue";
import RelativeTime from "@/components/common/RelativeTime.vue";
import ActionButtons from "@/components/common/ActionButtons.vue";

withDefaults(
  defineProps<{
    items: ContainerSummary[];
    pending: Set<string>;
    showProjectColumn?: boolean;
  }>(),
  { showProjectColumn: true },
);

function formatPorts(ports: { public?: number; private: number }[]): string {
  if (ports.length === 0) return "—";
  return ports
    .map((p) => (p.public ? `${p.public}→${p.private}` : `${p.private}`))
    .join(", ");
}
</script>

<template>
  <ResourceTable :items="items" :row-key="(c) => c.id" :pending="pending">
    <template #header>
      <th class="px-3 py-2">Nome</th>
      <th class="px-3 py-2">Imagem</th>
      <th class="px-3 py-2">Estado</th>
      <th class="px-3 py-2">Portas</th>
      <th class="px-3 py-2">Criado</th>
      <th v-if="showProjectColumn" class="px-3 py-2">Projeto</th>
      <th class="px-3 py-2">Ações</th>
    </template>
    <template #row="{ item, pending: rowPending }">
      <td class="px-3 py-2 font-medium">{{ item.name }}</td>
      <td class="px-3 py-2 text-neutral-500">{{ item.image }}</td>
      <td class="px-3 py-2"><StateBadge :state="item.state" /></td>
      <td class="px-3 py-2 text-neutral-500">{{ formatPorts(item.ports) }}</td>
      <td class="px-3 py-2 text-neutral-500"><RelativeTime :timestamp="item.createdAt" /></td>
      <td v-if="showProjectColumn" class="px-3 py-2 text-neutral-500">
        {{ item.compose?.project ?? "—" }}
      </td>
      <td class="px-3 py-2">
        <ActionButtons :container="item" :pending="rowPending" />
      </td>
    </template>
  </ResourceTable>
</template>
