import { ref } from "vue";
import { defineStore } from "pinia";
import type { DaemonEvent } from "@dockerlocal/shared";
import { createSseClient } from "@/api/sse";

type EventListener = (event: DaemonEvent) => void;

const EVENTS_PATH = "/system/events/stream";

export const useEventsStore = defineStore("events", () => {
  // null = ainda não sabemos (conectando); true/false = estado real do daemon
  const connected = ref<boolean | null>(null);
  const listeners = new Set<EventListener>();

  let source: EventSource | null = null;

  function connect(): void {
    if (source) return;

    source = createSseClient(EVENTS_PATH);

    source.addEventListener("connection", (e) => {
      const data = JSON.parse((e as MessageEvent).data) as { connected: boolean };
      connected.value = data.connected;
    });

    source.addEventListener("event", (e) => {
      const event = JSON.parse((e as MessageEvent).data) as DaemonEvent;
      for (const listener of listeners) listener(event);
    });

    // A conexão HTTP em si caiu (não é o mesmo que o daemon estar
    // desconectado — o EventSource nativo tenta reconectar sozinho).
    source.onerror = () => {
      connected.value = false;
    };
  }

  function reconnect(): void {
    source?.close();
    source = null;
    connect();
  }

  function subscribe(listener: EventListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { connected, connect, reconnect, subscribe };
});
