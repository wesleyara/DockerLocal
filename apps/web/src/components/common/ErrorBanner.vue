<script setup lang="ts">
defineProps<{ message: string }>();
</script>

<template>
  <div class="rounded border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
    {{ message }}
  </div>
</template>
