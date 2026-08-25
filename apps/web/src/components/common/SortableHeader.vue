<script setup lang="ts">
import { Icon } from "@iconify/vue";
import type { SortDirection } from "@/composables/useSortableTable";

const props = defineProps<{
  sortKey: string;
  activeKey: string | null;
  direction: SortDirection;
  align?: "left" | "right";
}>();

const emit = defineEmits<{ sort: [key: string] }>();

const active = () => props.activeKey === props.sortKey;
</script>

<template>
  <th class="px-3 py-2">
    <button
      type="button"
      class="col-label inline-flex items-center gap-1 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
      :class="{ 'text-slate-900 dark:text-slate-100': active(), 'flex-row-reverse': align === 'right' }"
      @click="emit('sort', sortKey)"
    >
      <slot />
      <Icon
        :icon="active() && direction === 'desc' ? 'lucide:chevron-down' : 'lucide:chevron-up'"
        class="h-3 w-3 shrink-0 transition-opacity"
        :class="active() ? 'opacity-100' : 'opacity-0 group-hover:opacity-40'"
      />
    </button>
  </th>
</template>
