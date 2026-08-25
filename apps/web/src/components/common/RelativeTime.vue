<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{ timestamp: number }>();

function format(seconds: number): string {
  const diff = Math.max(0, Date.now() / 1000 - seconds);
  const units: Array<[string, number]> = [
    ["ano", 31536000],
    ["mês", 2592000],
    ["dia", 86400],
    ["hora", 3600],
    ["minuto", 60],
  ];
  for (const [label, secs] of units) {
    const value = Math.floor(diff / secs);
    if (value >= 1) return `há ${value} ${label}${value > 1 ? "s" : ""}`;
  }
  return "agora mesmo";
}

const label = computed(() => format(props.timestamp));
</script>

<template>
  <span :title="new Date(timestamp * 1000).toLocaleString()">{{ label }}</span>
</template>
