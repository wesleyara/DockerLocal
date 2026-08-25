<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { useVirtualizer } from "@tanstack/vue-virtual";
import type { LogLine } from "@dockerlocal/shared";
import LogLineRow from "./LogLine.vue";

const props = defineProps<{
  lines: LogLine[];
  showTimestamps: boolean;
  wrap: boolean;
  resolveContainerLabel?: (containerId: string) => string;
}>();

const scrollEl = ref<HTMLDivElement | null>(null);
const atBottom = ref(true);

const virtualizer = useVirtualizer({
  get count() {
    return props.lines.length;
  },
  getScrollElement: () => scrollEl.value,
  estimateSize: () => 20,
  overscan: 20,
});

function isAtBottom(): boolean {
  const el = scrollEl.value;
  if (!el) return true;
  return el.scrollTop + el.clientHeight >= el.scrollHeight - 8;
}

function handleScroll(): void {
  atBottom.value = isAtBottom();
}

function scrollToBottom(): void {
  if (props.lines.length === 0) return;
  virtualizer.value.scrollToIndex(props.lines.length - 1, { align: "end" });
  atBottom.value = true;
}

watch(
  () => props.lines.length,
  async () => {
    if (!atBottom.value) return;
    await nextTick();
    scrollToBottom();
  },
);

defineExpose({ scrollToBottom });
</script>

<template>
  <div class="relative flex-1 overflow-hidden">
    <div ref="scrollEl" class="h-full overflow-y-auto" @scroll="handleScroll">
      <div :style="{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }">
        <div
          v-for="row in virtualizer.getVirtualItems()"
          :key="String(row.key)"
          :style="{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            transform: `translateY(${row.start}px)`,
          }"
        >
          <LogLineRow
            :line="lines[row.index]"
            :show-timestamps="showTimestamps"
            :wrap="wrap"
            :container-label="
              lines[row.index].containerId && resolveContainerLabel
                ? resolveContainerLabel(lines[row.index].containerId!)
                : undefined
            "
          />
        </div>
      </div>
    </div>

    <button
      v-if="!atBottom"
      class="absolute bottom-3 right-3 rounded-full bg-neutral-900 px-3 py-1 text-xs font-medium text-white shadow dark:bg-neutral-100 dark:text-neutral-900"
      @click="scrollToBottom"
    >
      ↓ novas linhas
    </button>
  </div>
</template>
