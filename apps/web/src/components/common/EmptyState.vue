<script setup lang="ts">
import { Icon } from "@iconify/vue";

withDefaults(defineProps<{ message: string; icon?: string }>(), {
  icon: "lucide:inbox",
});
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-3 py-16 text-slate-500 dark:text-slate-400">
    <span class="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
      <Icon :icon="icon" class="h-6 w-6" />
    </span>
    <p class="text-sm">{{ message }}</p>
  </div>
</template>
