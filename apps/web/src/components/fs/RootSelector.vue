<script setup lang="ts">
import { Icon } from "@iconify/vue";
import type { FsRoot } from "@dockerlocal/shared";

defineProps<{
  roots: FsRoot[];
  activeRoot: string | null;
}>();

const emit = defineEmits<{ select: [path: string] }>();
</script>

<template>
  <div class="flex flex-wrap gap-1.5">
    <button
      v-for="root in roots"
      :key="root.path"
      type="button"
      class="flex items-center gap-1.5 rounded-app-sm px-2.5 py-1 text-xs font-medium"
      :class="
        activeRoot === root.path
          ? 'bg-[var(--color-accent)] text-white'
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
      "
      @click="emit('select', root.path)"
    >
      <Icon icon="lucide:house" class="h-3.5 w-3.5" />
      {{ root.label }}
    </button>
  </div>
</template>
