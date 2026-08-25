<script setup lang="ts">
import { Icon } from "@iconify/vue";
import SideNav from "./SideNav.vue";
import StatusBar from "./StatusBar.vue";
import ConfirmDialog from "@/components/common/ConfirmDialog.vue";
import Toast from "@/components/common/Toast.vue";
import TaskDrawer from "@/components/tasks/TaskDrawer.vue";
import { useDockerEvents } from "@/composables/useDockerEvents";
import { useUiStore } from "@/stores/ui.store";
import { useTasksStore } from "@/stores/tasks.store";

// Conexão SSE de eventos do daemon: uma só, viva pelo tempo de vida do app,
// independente de qual view está montada.
useDockerEvents();

const ui = useUiStore();

// Retoma o acompanhamento de tasks ativas após um F5 — a saída completa
// volta pelo replay do buffer no servidor.
void useTasksStore().restoreActive();
</script>

<template>
  <div class="flex h-full flex-col bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
    <header
      class="flex shrink-0 items-center gap-2 border-b border-slate-200 px-3 py-2 sm:hidden dark:border-slate-800"
    >
      <button
        type="button"
        title="Abrir menu"
        class="rounded-app-sm p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        @click="ui.toggleMobileNav()"
      >
        <Icon icon="lucide:menu" class="h-5 w-5" />
      </button>
      <span class="text-sm font-semibold">DockerLocal</span>
    </header>

    <div class="flex flex-1 overflow-hidden">
      <SideNav />
      <main class="flex-1 overflow-auto p-3 sm:p-6">
        <RouterView />
      </main>
    </div>
    <StatusBar />
    <ConfirmDialog />
    <Toast />
    <TaskDrawer />
  </div>
</template>
