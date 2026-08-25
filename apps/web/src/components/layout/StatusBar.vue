<script setup lang="ts">
import { onMounted, ref } from "vue";
import { systemApi } from "@/api/system.api";
import { useUiStore } from "@/stores/ui.store";

const ui = useUiStore();
const errorMessage = ref<string | null>(null);

async function checkPing(): Promise<void> {
  try {
    const result = await systemApi.ping();
    ui.dockerConnected = result.ok;
    ui.engineVersion = result.engineVersion;
    errorMessage.value = null;
  } catch (err) {
    ui.dockerConnected = false;
    errorMessage.value = err instanceof Error ? err.message : "Falha ao conectar";
  }
}

onMounted(() => {
  void checkPing();
});
</script>

<template>
  <footer
    class="flex items-center gap-2 border-t border-neutral-200 bg-neutral-50 px-4 py-2 text-xs text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400"
  >
    <span
      class="inline-block h-2 w-2 rounded-full"
      :class="ui.dockerConnected ? 'bg-emerald-500' : 'bg-red-500'"
    />
    <span v-if="ui.dockerConnected">
      Docker {{ ui.engineVersion }} conectado
    </span>
    <span v-else>
      {{ errorMessage ?? "Conectando ao Docker…" }}
    </span>
  </footer>
</template>
