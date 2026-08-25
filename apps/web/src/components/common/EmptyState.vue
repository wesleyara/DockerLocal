<script setup lang="ts">
defineProps<{ message: string }>();
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-2 py-16 text-neutral-500 dark:text-neutral-400">
    <p class="text-sm">{{ message }}</p>
  </div>
</template>
