import { onMounted, onUnmounted, watch } from "vue";
import { useEventsStore } from "@/stores/events.store";

const DEGRADED_POLL_MS = 3_000;

/**
 * O polling é rede de segurança, não o caminho principal — os eventos do
 * daemon (fase 3) cuidam do refetch. Enquanto o SSE está saudável o timer
 * fica suspenso; se a conexão cair, volta a rodar a cada 3s até reconectar.
 */
export function useResourcePolling(fetchFn: () => Promise<void>): void {
  const events = useEventsStore();
  let timer: ReturnType<typeof setInterval> | null = null;

  function isHealthy(): boolean {
    return events.connected === true;
  }

  function stop(): void {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  }

  function start(): void {
    stop();
    if (document.visibilityState === "hidden") return;
    if (isHealthy()) return;
    timer = setInterval(() => {
      void fetchFn();
    }, DEGRADED_POLL_MS);
  }

  function handleVisibilityChange(): void {
    if (document.visibilityState === "hidden") {
      stop();
    } else {
      void fetchFn();
      start();
    }
  }

  const stopWatch = watch(
    () => events.connected,
    () => start(),
  );

  onMounted(() => {
    void fetchFn();
    start();
    document.addEventListener("visibilitychange", handleVisibilityChange);
  });

  onUnmounted(() => {
    stop();
    stopWatch();
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  });
}
