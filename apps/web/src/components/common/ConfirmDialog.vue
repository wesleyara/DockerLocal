<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Icon } from "@iconify/vue";
import { useConfirm } from "@/composables/useConfirm";

const { isOpen, options, resolve } = useConfirm();
const typedName = ref("");

watch(isOpen, (open) => {
  if (open) typedName.value = "";
});

const canConfirm = computed(() => {
  if (!options.value.requireTypedName) return true;
  return typedName.value === options.value.requireTypedName;
});

const destructive = computed(() => options.value.destructive ?? true);
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    @click.self="resolve(false)"
  >
    <div class="w-full max-w-sm rounded-app-lg border border-slate-200 bg-white p-5 shadow-[var(--shadow-elevated)] dark:border-slate-800 dark:bg-slate-900">
      <div class="flex items-start gap-3">
        <span
          v-if="destructive"
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400"
        >
          <Icon icon="lucide:triangle-alert" class="h-4.5 w-4.5" />
        </span>
        <div class="min-w-0 flex-1">
          <h2 class="text-base font-semibold text-slate-900 dark:text-slate-100">
            {{ options.title }}
          </h2>
          <p class="mt-2 break-words text-sm text-slate-600 dark:text-slate-400">
            {{ options.message }}
          </p>

          <div v-if="options.requireTypedName" class="mt-3">
            <label class="text-xs text-slate-500">
              Digite <span class="font-mono">{{ options.requireTypedName }}</span> para confirmar
            </label>
            <input
              v-model="typedName"
              type="text"
              class="mt-1 w-full rounded-app-sm border border-slate-300 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
        </div>
      </div>

      <div class="mt-5 flex justify-end gap-2">
        <button
          class="rounded-app-sm px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          @click="resolve(false)"
        >
          Cancelar
        </button>
        <button
          class="rounded-app-sm px-3 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          :class="destructive ? 'bg-red-600 hover:bg-red-700' : 'bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)]'"
          :disabled="!canConfirm"
          @click="resolve(true)"
        >
          {{ options.confirmLabel ?? "Confirmar" }}
        </button>
      </div>
    </div>
  </div>
</template>
