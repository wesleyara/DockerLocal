<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { useVirtualizer } from "@tanstack/vue-virtual";
import { Icon } from "@iconify/vue";
import type { TaskLine } from "@dockerlocal/shared";
import { stripAnsi } from "@/utils/ansi";

const props = defineProps<{
  lines: TaskLine[];
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
          <div
            class="whitespace-pre px-3 font-mono text-xs leading-5"
            :class="
              lines[row.index].stream === 'stderr'
                ? 'text-red-500 dark:text-red-400'
                : 'text-slate-800 dark:text-slate-200'
            "
          >
            {{ stripAnsi(lines[row.index].text) }}
          </div>
        </div>
      </div>
    </div>

    <button
      v-if="!atBottom"
      class="absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-white shadow-lg hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
      @click="scrollToBottom"
    >
      <Icon icon="lucide:arrow-down" class="h-3.5 w-3.5" />
      novas linhas
    </button>

    <div
      v-if="lines.length === 0"
      class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400 dark:text-slate-600"
    >
      <Icon icon="lucide:terminal" class="h-8 w-8" />
      <p class="text-sm">Aguardando saída…</p>
    </div>
  </div>
</template>
