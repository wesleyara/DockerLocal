<script setup lang="ts">
import { Icon } from "@iconify/vue";
import { useToast } from "@/composables/useToast";

const props = withDefaults(
  defineProps<{
    text: string;
    maxWidth?: string;
  }>(),
  { maxWidth: "220px" },
);

const toast = useToast();

async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(props.text);
    toast.success("Copiado para a área de transferência");
  } catch {
    toast.error("Falha ao copiar");
  }
}
</script>

<template>
  <span class="inline-flex min-w-0 max-w-full items-center gap-1">
    <span class="truncate" :style="{ maxWidth: props.maxWidth }" :title="text">{{ text }}</span>
    <button
      type="button"
      title="Copiar"
      class="shrink-0 rounded-app-sm p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
      @click.stop="copy"
    >
      <Icon icon="lucide:copy" class="h-3 w-3" />
    </button>
  </span>
</template>
