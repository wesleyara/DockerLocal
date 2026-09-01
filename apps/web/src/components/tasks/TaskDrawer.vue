<script setup lang="ts">
import { computed } from "vue";
import { Icon } from "@iconify/vue";
import type { TaskStatus } from "@dockerlocal/shared";
import { useTasksStore } from "@/stores/tasks.store";
import { useToast } from "@/composables/useToast";
import TaskOutput from "./TaskOutput.vue";
import PullProgress from "./PullProgress.vue";

const store = useTasksStore();
const toast = useToast();

const task = computed(() => (store.selectedId ? store.tasks.get(store.selectedId) : undefined));
const lines = computed(() => (store.selectedId ? store.linesFor(store.selectedId) : []));

const statusTone: Record<TaskStatus, string> = {
  running: "text-blue-600 dark:text-blue-400",
  succeeded: "text-emerald-600 dark:text-emerald-400",
  failed: "text-red-600 dark:text-red-400",
  cancelled: "text-amber-600 dark:text-amber-400",
};

const statusIcon: Record<TaskStatus, string> = {
  running: "lucide:loader-2",
  succeeded: "lucide:check-circle-2",
  failed: "lucide:x-circle",
  cancelled: "lucide:ban",
};

async function handleCancel(): Promise<void> {
  if (!store.selectedId) return;
  try {
    await store.cancel(store.selectedId);
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Falha ao cancelar task");
  }
}
</script>

<template>
  <Transition name="drawer">
    <div v-if="store.drawerOpen" class="fixed inset-0 z-40 flex justify-end">
      <div class="absolute inset-0 bg-black/30" @click="store.close()" />
      <div
        class="relative flex h-full w-full max-w-lg flex-col border-l border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-950"
      >
        <div class="flex items-center gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <Icon
            :icon="task ? statusIcon[task.status] : 'lucide:list-checks'"
            class="h-4 w-4 shrink-0"
            :class="[task ? statusTone[task.status] : 'text-slate-400', task?.status === 'running' ? 'animate-spin' : '']"
          />
          <h2 class="min-w-0 flex-1 truncate text-sm font-semibold">
            {{ task?.label ?? "Task" }}
          </h2>
          <button
            v-if="task?.status === 'running'"
            title="Cancelar"
            class="rounded-app-sm px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950"
            @click="handleCancel"
          >
            Cancelar
          </button>
          <button
            title="Fechar"
            class="rounded-app-sm p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            @click="store.close()"
          >
            <Icon icon="lucide:x" class="h-4 w-4" />
          </button>
        </div>

        <p
          v-if="task?.status === 'failed' && task.message"
          class="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
        >
          {{ task.message }}
        </p>

        <PullProgress
          v-if="task && ['image-pull', 'compose-up', 'compose-pull'].includes(task.kind)"
          :lines="lines"
        />
        <TaskOutput v-else :lines="lines" />
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 0.15s ease;
}
.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}
</style>
