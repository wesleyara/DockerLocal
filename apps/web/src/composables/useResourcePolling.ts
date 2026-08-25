import { onMounted, onUnmounted } from "vue";

const POLL_INTERVAL_MS = 10_000;

export function useResourcePolling(fetchFn: () => Promise<void>): void {
  let timer: ReturnType<typeof setInterval> | null = null;

  function start(): void {
    if (timer) return;
    timer = setInterval(() => {
      void fetchFn();
    }, POLL_INTERVAL_MS);
  }

  function stop(): void {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  }

  function handleVisibilityChange(): void {
    if (document.visibilityState === "hidden") {
      stop();
    } else {
      void fetchFn();
      start();
    }
  }

  onMounted(() => {
    void fetchFn();
    if (document.visibilityState !== "hidden") {
      start();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
  });

  onUnmounted(() => {
    stop();
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  });
}
