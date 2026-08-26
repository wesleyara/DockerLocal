<script setup lang="ts">
import { computed } from "vue";
import type { ImageSummary } from "@dockerlocal/shared";
import ResourceTable from "@/components/common/ResourceTable.vue";
import SortableHeader from "@/components/common/SortableHeader.vue";
import RelativeTime from "@/components/common/RelativeTime.vue";
import ActionButtons from "@/components/images/ActionButtons.vue";
import SelfBadge from "@/components/common/SelfBadge.vue";
import { formatBytes } from "@/utils/format";
import { useSortableTable } from "@/composables/useSortableTable";

const props = defineProps<{
  items: ImageSummary[];
  pending: Set<string>;
}>();

const itemsRef = computed(() => props.items);
const { sorted, sortKey, sortDir, toggleSort } = useSortableTable(itemsRef, {
  tags: (i) => i.repoTags[0] ?? i.shortId,
  id: (i) => i.shortId,
  size: (i) => i.size,
  created: (i) => i.createdAt,
});
</script>

<template>
  <ResourceTable :items="sorted" :row-key="(i) => i.id" :pending="pending">
    <template #header>
      <SortableHeader sort-key="tags" :active-key="sortKey" :direction="sortDir" @sort="toggleSort">Tags</SortableHeader>
      <SortableHeader sort-key="id" :active-key="sortKey" :direction="sortDir" @sort="toggleSort">ID</SortableHeader>
      <SortableHeader sort-key="size" :active-key="sortKey" :direction="sortDir" @sort="toggleSort">Tamanho</SortableHeader>
      <SortableHeader sort-key="created" :active-key="sortKey" :direction="sortDir" @sort="toggleSort">Criada</SortableHeader>
      <th class="px-3 py-2 col-label text-slate-500 dark:text-slate-400">Em uso por</th>
      <th class="px-3 py-2 col-label text-right text-slate-500 dark:text-slate-400">Ações</th>
    </template>
    <template #row="{ item, pending: rowPending }">
      <td class="px-3 py-2 font-medium">
        <div class="flex flex-wrap items-center gap-1.5">
          <span
            v-for="tag in item.repoTags"
            :key="tag"
            class="rounded-app-sm bg-slate-100 px-1.5 py-0.5 font-mono text-xs dark:bg-slate-800"
          >
            {{ tag }}
          </span>
          <span
            v-if="item.dangling"
            class="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
          >
            dangling
          </span>
          <SelfBadge v-if="item.isSelf" />
        </div>
      </td>
      <td class="px-3 py-2 font-mono text-xs text-slate-500">{{ item.shortId }}</td>
      <td class="tabular px-3 py-2 text-slate-500">{{ formatBytes(item.size) }}</td>
      <td class="px-3 py-2 text-slate-500"><RelativeTime :timestamp="item.createdAt" /></td>
      <td class="px-3 py-2 text-slate-500">
        <span v-if="item.usedBy.length === 0">—</span>
        <span v-else>{{ item.usedBy.join(", ") }}</span>
      </td>
      <td class="px-3 py-2">
        <ActionButtons :image="item" :pending="rowPending" />
      </td>
    </template>
  </ResourceTable>
</template>
