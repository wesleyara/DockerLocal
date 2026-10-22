<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import type { TaskLine } from "@dockerlocal/shared";
import "@xterm/xterm/css/xterm.css";

// Mesma largura do PTY no servidor (PTY_COLS): o redesenho in-place do
// compose/BuildKit usa cursor-up e quebraria se as larguras divergissem.
const COLS = 100;

// O xterm não lê CSS variables, então a fonte vai aqui. JetBrains Mono é a
// mesma do terminal local, para a saída ficar idêntica à do `pnpm dev`.
const FONT_FAMILY =
  '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace';

const props = defineProps<{
  lines: TaskLine[];
}>();

const el = ref<HTMLDivElement | null>(null);
let term: Terminal | null = null;
let fit: FitAddon | null = null;
let resizeObserver: ResizeObserver | null = null;
let lastSeq = -1;

function flush(): void {
  if (!term) return;
  for (const line of props.lines) {
    if (line.seq <= lastSeq) continue;
    lastSeq = line.seq;
    // Linhas não-raw (avisos de preflight, erros) não trazem quebra de linha.
    term.write(line.raw ? line.text : `${line.text}\r\n`);
  }
}

function refit(): void {
  const dims = fit?.proposeDimensions();
  if (dims && term) term.resize(COLS, Math.max(dims.rows, 5));
}

onMounted(async () => {
  // O xterm mede a célula na abertura: com a fonte ainda não carregada ele
  // mede o fallback e o texto desalinha depois.
  await document.fonts.load(`12px ${FONT_FAMILY}`).catch(() => []);
  if (!el.value) return;
  term = new Terminal({
    cols: COLS,
    disableStdin: true,
    cursorStyle: "underline",
    cursorInactiveStyle: "none",
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    scrollback: 10_000,
    theme: { background: "#0f172a" },
  });
  fit = new FitAddon();
  term.loadAddon(fit);
  term.open(el.value);
  refit();
  flush();

  resizeObserver = new ResizeObserver(refit);
  resizeObserver.observe(el.value!);
});

watch(() => props.lines, flush);

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  term?.dispose();
  term = null;
});
</script>

<template>
  <div class="relative flex-1 overflow-auto bg-slate-900 p-2">
    <div ref="el" class="h-full" />
  </div>
</template>
