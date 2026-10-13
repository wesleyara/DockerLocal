<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{ timestamp: number }>();

function format(seconds: number): string {
  const diff = Math.max(0, Date.now() / 1000 - seconds);
  const units: Array<[string, string, number]> = [
    ["ano", "anos", 31536000],
    ["mês", "meses", 2592000],
    ["dia", "dias", 86400],
    ["hora", "horas", 3600],
    ["minuto", "minutos", 60],
  ];
  for (const [singular, plural, secs] of units) {
    const value = Math.floor(diff / secs);
    if (value >= 1) return `há ${value} ${value > 1 ? plural : singular}`;
  }
  return "agora mesmo";
}

const label = computed(() => format(props.timestamp));
</script>

<template>
  <span :title="new Date(timestamp * 1000).toLocaleString()">{{ label }}</span>
</template>
