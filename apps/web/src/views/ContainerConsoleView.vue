<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Icon } from "@iconify/vue";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { io, type Socket } from "socket.io-client";
import "@xterm/xterm/css/xterm.css";
import { useContainersStore } from "@/stores/containers.store";
import StateBadge from "@/components/common/StateBadge.vue";

const route = useRoute();
const router = useRouter();
const containerId = route.params.id as string;

const store = useContainersStore();
if (store.items.length === 0) void store.fetch();
const container = computed(() => store.items.find((c) => c.id === containerId));

function goBack(): void {
  if (window.history.length > 1) router.back();
  else router.push("/containers");
}

const terminalEl = ref<HTMLDivElement | null>(null);
const status = ref<"connecting" | "ready" | "closed" | "error">("connecting");
const errorMessage = ref<string | null>(null);

let term: Terminal | null = null;
let fitAddon: FitAddon | null = null;
const socket = shallowRef<Socket | null>(null);
let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  term = new Terminal({
    convertEol: true,
    cursorBlink: true,
    fontSize: 13,
    theme: { background: "#0f172a" },
  });
  fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  term.open(terminalEl.value!);
  fitAddon.fit();

  const s = io("/ws/exec", {
    query: { containerId },
    // O handshake HTTP fica em /socket.io — path default do engine.io,
    // não confundir com a namespace lógica acima.
    withCredentials: false,
  });
  socket.value = s;

  s.on("connect_error", (err: Error) => {
    status.value = "error";
    errorMessage.value = err.message;
  });
  s.on("error", (message: string) => {
    status.value = "error";
    errorMessage.value = message;
  });
  s.on("ready", () => {
    status.value = "ready";
    term!.focus();
    sendResize();
  });
  s.on("output", (data: string) => term!.write(data));
  s.on("disconnect", () => {
    if (status.value !== "error") status.value = "closed";
  });

  term.onData((data) => s.emit("input", data));

  resizeObserver = new ResizeObserver(() => {
    fitAddon?.fit();
    sendResize();
  });
  resizeObserver.observe(terminalEl.value!);
});

function sendResize(): void {
  if (!term || !socket.value?.connected) return;
  socket.value.emit("resize", { cols: term.cols, rows: term.rows });
}

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  socket.value?.disconnect();
  term?.dispose();
});
</script>

<template>
  <div class="flex h-[calc(100vh-11rem)] flex-col rounded-app-md border border-slate-200 sm:h-[calc(100vh-8rem)] dark:border-slate-800">
    <div class="flex items-center gap-3 border-b border-slate-200 px-3 py-2.5 dark:border-slate-800">
      <button
        type="button"
        title="Voltar para Containers"
        class="flex items-center gap-1 rounded-app-sm px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        @click="goBack"
      >
        <Icon icon="lucide:arrow-left" class="h-4 w-4" />
        Voltar
      </button>

      <div class="h-5 w-px bg-slate-200 dark:bg-slate-800" />

      <Icon icon="lucide:square-terminal" class="h-4 w-4 shrink-0 text-slate-400" />
      <h1 class="flex min-w-0 items-center gap-2 text-sm font-semibold">
        <span class="truncate">{{ container?.name ?? containerId.slice(0, 12) }}</span>
        <StateBadge v-if="container" :state="container.state" />
      </h1>

      <span
        v-if="status === 'connecting'"
        class="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400"
      >
        <Icon icon="lucide:loader-2" class="h-3.5 w-3.5 animate-spin" />
        conectando…
      </span>
      <span
        v-else-if="status === 'closed'"
        class="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400"
      >
        <Icon icon="lucide:triangle-alert" class="h-3.5 w-3.5" />
        sessão encerrada
      </span>
      <span
        v-else-if="status === 'error'"
        class="flex items-center gap-1 text-xs text-red-600 dark:text-red-400"
      >
        <Icon icon="lucide:circle-x" class="h-3.5 w-3.5" />
        {{ errorMessage ?? "erro na conexão" }}
      </span>
    </div>

    <div ref="terminalEl" class="min-h-0 flex-1 bg-[#0f172a] p-2" />
  </div>
</template>
