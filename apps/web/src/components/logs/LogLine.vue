<script setup lang="ts">
import { computed } from "vue";
import type { LogLine } from "@dockerlocal/shared";
import { stripAnsi } from "@/utils/ansi";

const props = defineProps<{
  line: LogLine;
  showTimestamps: boolean;
  wrap: boolean;
}>();

const text = computed(() => stripAnsi(props.line.text));
const time = computed(() => {
  if (!props.showTimestamps || !props.line.timestamp) return null;
  return props.line.timestamp.replace("T", " ").replace("Z", "").split(".")[0];
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
    <span v-if="time" class="shrink-0 select-none text-neutral-500">{{ time }}</span>
    <span>{{ text }}</span>
  </div>
</template>
