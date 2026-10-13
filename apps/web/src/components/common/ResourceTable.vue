<script setup lang="ts" generic="T">
const props = defineProps<{
  items: T[];
  rowKey: (item: T) => string;
  pending?: Set<string>;
}>();

function isPending(item: T): boolean {
  return props.pending?.has(props.rowKey(item)) ?? false;
}
</script>

<template>
  <table class="w-full border-collapse text-sm">
    <thead>
      <tr class="border-b border-slate-200 bg-slate-50/60 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
        <slot name="header" />
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="item in items"
        :key="rowKey(item)"
        class="border-b border-slate-100 transition-colors last:border-b-0 hover:bg-slate-50 dark:border-slate-900 dark:hover:bg-slate-800/40"
        :class="{ 'pointer-events-none opacity-40 transition-opacity': isPending(item) }"
      >
        <slot name="row" :item="item" :pending="isPending(item)" />
      </tr>
    </tbody>
  </table>
</template>
