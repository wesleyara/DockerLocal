<script setup lang="ts">
const links = [
  { to: "/containers", label: "Containers" },
  { to: "/images", label: "Images" },
  { to: "/volumes", label: "Volumes" },
  { to: "/stacks", label: "Stacks" },
];
</script>

<template>
  <nav class="flex w-48 shrink-0 flex-col gap-1 border-r border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900">
    <RouterLink
      v-for="link in links"
      :key="link.to"
      :to="link.to"
      class="rounded px-3 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-200 dark:text-neutral-300 dark:hover:bg-neutral-800"
      active-class="bg-neutral-900 text-white hover:bg-neutral-900 dark:bg-white dark:text-neutral-900 dark:hover:bg-white"
    >
      {{ link.label }}
    </RouterLink>
  </nav>
</template>
