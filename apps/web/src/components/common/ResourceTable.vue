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
      <tr class="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
        <slot name="header" />
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="item in items"
        :key="rowKey(item)"
        class="border-b border-neutral-100 transition-opacity dark:border-neutral-900"
        :class="{ 'pointer-events-none opacity-40': isPending(item) }"
      >
        <slot name="row" :item="item" :pending="isPending(item)" />
      </tr>
    </tbody>
  </table>
</template>
