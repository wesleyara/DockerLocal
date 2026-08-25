<script setup lang="ts">
import type { ContainerSummary } from "@dockerlocal/shared";
import { Icon } from "@iconify/vue";
import ResourceTable from "@/components/common/ResourceTable.vue";
import SortableHeader from "@/components/common/SortableHeader.vue";
import StateBadge from "@/components/common/StateBadge.vue";
import RelativeTime from "@/components/common/RelativeTime.vue";
import ActionButtons from "@/components/common/ActionButtons.vue";
import { useSortableTable } from "@/composables/useSortableTable";
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    items: ContainerSummary[];
    pending: Set<string>;
    showProjectColumn?: boolean;
  }>(),
  { showProjectColumn: true },
);

const itemsRef = computed(() => props.items);
const { sorted, sortKey, sortDir, toggleSort } = useSortableTable(itemsRef, {
  name: (c) => c.name,
  image: (c) => c.image,
  state: (c) => c.state,
  created: (c) => c.createdAt,
  project: (c) => c.compose?.project ?? "",
});

function portLabel(p: { public?: number; private: number; type: string }): string {
  return p.public ? `${p.public}:${p.private}` : `${p.private}/${p.type}`;
}

function portUrl(p: { public?: number; private: number; type: string }): string | null {
  return p.public && p.type === "tcp" ? `http://localhost:${p.public}` : null;
}
</script>

<template>
  <ResourceTable :items="sorted" :row-key="(c) => c.id" :pending="pending">
    <template #header>
      <SortableHeader sort-key="name" :active-key="sortKey" :direction="sortDir" @sort="toggleSort">Nome</SortableHeader>
      <SortableHeader sort-key="image" :active-key="sortKey" :direction="sortDir" @sort="toggleSort">Imagem</SortableHeader>
      <SortableHeader sort-key="state" :active-key="sortKey" :direction="sortDir" @sort="toggleSort">Estado</SortableHeader>
      <th class="px-3 py-2 col-label text-slate-500 dark:text-slate-400">Portas</th>
      <SortableHeader sort-key="created" :active-key="sortKey" :direction="sortDir" @sort="toggleSort">Criado</SortableHeader>
      <SortableHeader v-if="showProjectColumn" sort-key="project" :active-key="sortKey" :direction="sortDir" @sort="toggleSort">Projeto</SortableHeader>
      <th class="px-3 py-2 col-label text-slate-500 dark:text-slate-400">Ações</th>
    </template>
    <template #row="{ item, pending: rowPending }">
      <td class="px-3 py-2 font-medium">{{ item.name }}</td>
      <td class="px-3 py-2 text-slate-500">{{ item.image }}</td>
      <td class="px-3 py-2"><StateBadge :state="item.state" /></td>
      <td class="px-3 py-2 text-slate-500">
        <span v-if="item.ports.length === 0">—</span>
        <div v-else class="flex flex-col gap-0.5">
          <template v-for="(p, i) in item.ports" :key="`${p.public ?? ''}-${p.private}-${p.type}-${i}`">
            <a
              v-if="portUrl(p)"
              :href="portUrl(p)!"
              target="_blank"
              rel="noopener"
              class="tabular inline-flex w-fit items-center gap-1 text-[var(--color-accent)] hover:underline"
              @click.stop
            >
              {{ portLabel(p) }}
              <Icon icon="lucide:external-link" class="h-3 w-3 shrink-0 opacity-70" />
            </a>
            <span v-else class="tabular font-mono text-xs">{{ portLabel(p) }}</span>
          </template>
        </div>
      </td>
      <td class="px-3 py-2 text-slate-500"><RelativeTime :timestamp="item.createdAt" /></td>
      <td v-if="showProjectColumn" class="px-3 py-2 text-slate-500">
        {{ item.compose?.project ?? "—" }}
      </td>
      <td class="px-3 py-2">
        <ActionButtons :container="item" :pending="rowPending" />
      </td>
    </template>
  </ResourceTable>
</template>
