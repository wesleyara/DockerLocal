<script setup lang="ts">
import { computed } from "vue";
import type { LogLine } from "@dockerlocal/shared";
import { stripAnsi } from "@/utils/ansi";

const props = defineProps<{
  line: LogLine;
  showTimestamps: boolean;
  wrap: boolean;
  containerLabel?: string;
}>();

const text = computed(() => stripAnsi(props.line.text));
const time = computed(() => {
  if (!props.showTimestamps || !props.line.timestamp) return null;
  return props.line.timestamp.replace("T", " ").replace("Z", "").split(".")[0];
});

// Cor determinística a partir do id/nome do container, para diferenciar
// visualmente as origens no viewer agregado sem depender de uma paleta fixa.
const labelHue = computed(() => {
  const source = props.containerLabel ?? "";
  let hash = 0;
  for (let i = 0; i < source.length; i++) {
    hash = (hash * 31 + source.charCodeAt(i)) % 360;
  }
  return hash;
});
</script>

<template>
  <div
    class="flex gap-2 px-3 font-mono text-xs leading-5"
    :class="[
      line.stream === 'stderr' ? 'text-red-500 dark:text-red-400' : 'text-neutral-800 dark:text-neutral-200',
      wrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre',
    ]"
  >
    <span
      v-if="containerLabel"
      class="shrink-0 select-none rounded px-1 font-semibold"
      :style="{ color: `hsl(${labelHue}, 70%, 45%)`, backgroundColor: `hsla(${labelHue}, 70%, 45%, 0.12)` }"
    >
      {{ containerLabel }}
    </span>
    <span v-if="time" class="shrink-0 select-none text-neutral-500">{{ time }}</span>
    <span>{{ text }}</span>
  </div>
</template>
