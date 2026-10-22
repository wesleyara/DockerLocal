<script setup lang="ts">
import { computed } from "vue";
import type { VolumeSummary } from "@dockerlocal/shared";
import ResourceTable from "@/components/common/ResourceTable.vue";
import SortableHeader from "@/components/common/SortableHeader.vue";
import SelfBadge from "@/components/common/SelfBadge.vue";
import ActionButtons from "@/components/volumes/ActionButtons.vue";
import { formatBytes } from "@/utils/format";
import { useSortableTable } from "@/composables/useSortableTable";

const props = defineProps<{
  items: VolumeSummary[];
  pending: Set<string>;
}>();

const itemsRef = computed(() => props.items);
const { sorted, sortKey, sortDir, toggleSort } = useSortableTable(itemsRef, {
  name: (v) => v.name,
  driver: (v) => v.driver,
  project: (v) => v.project ?? "",
  size: (v) => v.size ?? -1,
});
</script>

<template>
  <ResourceTable :items="sorted" :row-key="(v) => v.name" :pending="pending">
    <template #header>
      <SortableHeader sort-key="name" :active-key="sortKey" :direction="sortDir" @sort="toggleSort">Nome</SortableHeader>
      <SortableHeader sort-key="driver" :active-key="sortKey" :direction="sortDir" @sort="toggleSort">Driver</SortableHeader>
      <SortableHeader sort-key="project" :active-key="sortKey" :direction="sortDir" @sort="toggleSort">Projeto</SortableHeader>
      <SortableHeader sort-key="size" :active-key="sortKey" :direction="sortDir" @sort="toggleSort">Tamanho</SortableHeader>
      <th class="px-3 py-2 col-label text-slate-500 dark:text-slate-400">Em uso por</th>
      <th class="px-3 py-2 col-label text-slate-500 dark:text-slate-400">Mountpoint</th>
      <th class="px-3 py-2 col-label text-right text-slate-500 dark:text-slate-400">Ações</th>
    </template>
    <template #row="{ item, pending: rowPending }">
      <td class="px-3 py-2 font-medium">
        <div class="flex flex-wrap items-center gap-1.5">
          <router-link
            :to="{ name: 'volume-files', params: { name: item.name, path: [] } }"
            class="hover:text-[var(--color-accent)] hover:underline"
          >
            {{ item.name }}
          </router-link>
          <SelfBadge v-if="item.isSelf" />
        </div>
      </td>
      <td class="px-3 py-2 text-slate-500">{{ item.driver }}</td>
      <td class="px-3 py-2 text-slate-500">{{ item.project ?? "—" }}</td>
      <td class="px-3 py-2 whitespace-nowrap text-slate-500">
        {{ item.size !== undefined ? formatBytes(item.size) : "—" }}
      </td>
      <td class="px-3 py-2 text-slate-500">
        <span v-if="item.usedBy.length === 0">—</span>
        <span v-else>{{ item.usedBy.join(", ") }}</span>
      </td>
      <td class="px-3 py-2 truncate font-mono text-xs text-slate-500" :title="item.mountpoint">
        {{ item.mountpoint }}
      </td>
      <td class="px-3 py-2">
        <ActionButtons :volume="item" :pending="rowPending" />
      </td>
    </template>
  </ResourceTable>
</template>
