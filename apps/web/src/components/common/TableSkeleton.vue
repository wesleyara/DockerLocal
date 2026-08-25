<script setup lang="ts">
withDefaults(defineProps<{ columns?: number; rows?: number }>(), {
  columns: 5,
  rows: 6,
});
</script>

<template>
  <table class="w-full border-collapse text-sm">
    <tbody>
      <tr v-for="row in rows" :key="row" class="border-b border-slate-100 dark:border-slate-900">
        <td v-for="col in columns" :key="col" class="px-3 py-3">
          <div
            class="h-3.5 animate-pulse rounded-app-sm bg-slate-200 dark:bg-slate-800"
            :style="{ width: col === 1 ? '70%' : `${45 + ((col * 13) % 35)}%` }"
          />
        </td>
      </tr>
    </tbody>
  </table>
</template>
