import { onUnmounted, ref, shallowRef, watch, type Ref } from "vue";
import type { LogEndEvent, LogLine } from "@dockerlocal/shared";
import { createSseClient } from "@/api/sse";

const MAX_LINES = 10_000;

export interface UseLogStreamOptions {
  /**
   * `false` para o stream agregado de grupo: um `log-end` identifica só o
   * container que parou, e não deve fechar a conexão dos demais.
   */
  closeOnEnd?: boolean;
}

export function useLogStream(path: Ref<string>, options: UseLogStreamOptions = {}) {
  const closeOnEnd = options.closeOnEnd ?? true;

  const lines = shallowRef<LogLine[]>([]);
  const connected = ref(false);
  const paused = ref(false);
  const dropped = ref(0);
  const ended = ref<LogEndEvent | null>(null);
  const endedContainers = shallowRef<Set<string>>(new Set());

  let pendingBuffer: LogLine[] = [];
  let rafId: number | null = null;
  let es: EventSource | null = null;

  function scheduleCommit(): void {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      if (paused.value || pendingBuffer.length === 0) return;
      const merged = lines.value.concat(pendingBuffer);
      pendingBuffer = [];
      lines.value = merged.length > MAX_LINES ? merged.slice(merged.length - MAX_LINES) : merged;
    });
  }

  function connect(): void {
    disconnect();
    ended.value = null;
    endedContainers.value = new Set();

    es = createSseClient(path.value);

    es.addEventListener("open", () => {
      connected.value = true;
    });

    es.addEventListener("logs", (e: MessageEvent) => {
      const payload = JSON.parse(e.data) as { lines: LogLine[]; dropped: number };
      pendingBuffer.push(...payload.lines);
      if (pendingBuffer.length > MAX_LINES) {
        pendingBuffer = pendingBuffer.slice(pendingBuffer.length - MAX_LINES);
      }
      dropped.value += payload.dropped;
      scheduleCommit();
    });

    es.addEventListener("log-end", (e: MessageEvent) => {
      const payload = JSON.parse(e.data) as LogEndEvent;
      if (closeOnEnd) {
        ended.value = payload;
        connected.value = false;
        es?.close();
      } else if (payload.containerId) {
        endedContainers.value = new Set(endedContainers.value).add(payload.containerId);
      }
    });

    es.addEventListener("error", () => {
      connected.value = false;
    });
  }

  function disconnect(): void {
    es?.close();
    es = null;
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function clear(): void {
    lines.value = [];
    pendingBuffer = [];
  }

  watch(path, () => {
    clear();
    connect();
  });

  connect();
  onUnmounted(disconnect);

  return { lines, connected, paused, dropped, ended, endedContainers, clear };
}
