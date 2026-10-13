import { onMounted, onUnmounted } from "vue";
import type { DaemonEvent, DaemonEventType } from "@dockerlocal/shared";
import { useEventsStore } from "@/stores/events.store";
import { useContainersStore } from "@/stores/containers.store";
import { useImagesStore } from "@/stores/images.store";
import { useVolumesStore } from "@/stores/volumes.store";

const DEBOUNCE_MS = 300;

/**
 * O evento é invalidação de cache, não fonte de dados — `docker events` não
 * traz status/portas/uptime. Ao chegar um evento, refaz o fetch do recurso
 * afetado (debounced, para não disparar N requests quando um `compose up`
 * sobe vários serviços de uma vez).
 */
export function useDockerEvents(): void {
  const events = useEventsStore();
  const containers = useContainersStore();
  const images = useImagesStore();
  const volumes = useVolumesStore();

  const timers = new Map<DaemonEventType, ReturnType<typeof setTimeout>>();

  function scheduleRefetch(type: DaemonEventType, fetchFn: () => void): void {
    const existing = timers.get(type);
    if (existing) clearTimeout(existing);
    timers.set(
      type,
      setTimeout(() => {
        timers.delete(type);
        fetchFn();
      }, DEBOUNCE_MS),
    );
  }

  function handleEvent(event: DaemonEvent): void {
    if (event.type === "container") {
      scheduleRefetch("container", () => void containers.fetch(true));
    } else if (event.type === "image") {
      scheduleRefetch("image", () => void images.fetch(true));
    } else if (event.type === "volume") {
      scheduleRefetch("volume", () => void volumes.fetch(true));
    }
  }

  let unsubscribe: (() => void) | null = null;

  function handleVisibilityChange(): void {
    // Abas em segundo plano podem ter a conexão suspensa pelo browser sem
    // disparar `onerror` — força uma reconexão ao voltar ao primeiro plano.
    if (document.visibilityState !== "hidden") {
      events.reconnect();
    }
  }

  onMounted(() => {
    events.connect();
    unsubscribe = events.subscribe(handleEvent);
    document.addEventListener("visibilitychange", handleVisibilityChange);
  });

  onUnmounted(() => {
    unsubscribe?.();
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
  });
}
