<script setup lang="ts">
import { computed, ref, watch } from "vue";
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
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    @click.self="resolve(false)"
  >
    <div class="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl dark:bg-neutral-900">
      <h2 class="text-base font-semibold text-neutral-900 dark:text-neutral-100">
        {{ options.title }}
      </h2>
      <p class="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
        {{ options.message }}
      </p>

      <div v-if="options.requireTypedName" class="mt-3">
        <label class="text-xs text-neutral-500">
          Digite <span class="font-mono">{{ options.requireTypedName }}</span> para confirmar
        </label>
        <input
          v-model="typedName"
          type="text"
          class="mt-1 w-full rounded border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-800"
        />
      </div>

      <div class="mt-5 flex justify-end gap-2">
        <button
          class="rounded px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
          @click="resolve(false)"
        >
          Cancelar
        </button>
        <button
          class="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="!canConfirm"
          @click="resolve(true)"
        >
          {{ options.confirmLabel ?? "Confirmar" }}
        </button>
      </div>
    </div>
  </div>
</template>
