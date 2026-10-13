<script setup lang="ts">
import { Icon } from "@iconify/vue";
import { useToast } from "@/composables/useToast";
import type { ToastKind } from "@/composables/useToast";

const { toasts, dismiss } = useToast();

const icon: Record<ToastKind, string> = {
  success: "lucide:check-circle-2",
  error: "lucide:x-circle",
  info: "lucide:info",
};

const tone: Record<ToastKind, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  error: "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
  info: "border-slate-200 bg-white text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200",
};

const iconTone: Record<ToastKind, string> = {
  success: "text-emerald-600 dark:text-emerald-400",
  error: "text-red-600 dark:text-red-400",
  info: "text-slate-500 dark:text-slate-400",
};
</script>

<template>
  <div class="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2">
    <TransitionGroup name="toast">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="pointer-events-auto flex items-start gap-2 rounded-app-md border px-3 py-2.5 text-sm shadow-[var(--shadow-elevated)]"
        :class="tone[toast.kind]"
        role="status"
      >
        <Icon :icon="icon[toast.kind]" class="mt-0.5 h-4 w-4 shrink-0" :class="iconTone[toast.kind]" />
        <p class="flex-1 leading-snug">{{ toast.message }}</p>
        <button
          type="button"
          class="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100"
          aria-label="Fechar"
          @click="dismiss(toast.id)"
        >
          <Icon icon="lucide:x" class="h-3.5 w-3.5" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.2s ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(16px);
}
</style>
