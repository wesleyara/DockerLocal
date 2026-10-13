<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { Icon } from "@iconify/vue";
import { systemApi } from "@/api/system.api";
import { useUiStore } from "@/stores/ui.store";
import { useEventsStore } from "@/stores/events.store";
import TaskIndicator from "./TaskIndicator.vue";

const ui = useUiStore();
const events = useEventsStore();
const errorMessage = ref<string | null>(null);

async function checkPing(): Promise<void> {
  try {
    const result = await systemApi.ping();
    ui.engineVersion = result.engineVersion;
    errorMessage.value = null;
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : "Falha ao conectar";
  }
}

// A verdade sobre a conexão é o stream de eventos, não o ping inicial —
// um daemon que cai depois do primeiro ping ainda deve virar "desconectado".
const connected = computed(() => events.connected !== false);

onMounted(() => {
  void checkPing();
});
</script>

<template>
  <footer
    class="flex items-center gap-2 border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400"
  >
    <Icon
      :icon="connected ? 'lucide:plug-zap' : 'lucide:plug'"
      class="h-3.5 w-3.5"
      :class="connected ? 'text-emerald-500' : 'text-red-500'"
      :title="connected ? 'Conectado ao Docker' : 'Desconectado do Docker'"
    />
    <span v-if="connected && ui.engineVersion">
      Docker {{ ui.engineVersion }} conectado
    </span>
    <span v-else-if="connected">
      {{ errorMessage ?? "Conectando ao Docker…" }}
    </span>
    <span v-else>desconectado do Docker</span>

    <TaskIndicator class="ml-auto" />
  </footer>
</template>
