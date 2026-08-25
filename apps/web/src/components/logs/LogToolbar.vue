<script setup lang="ts">
const filter = defineModel<string>("filter", { required: true });
const showStdout = defineModel<boolean>("showStdout", { required: true });
const showStderr = defineModel<boolean>("showStderr", { required: true });
const showTimestamps = defineModel<boolean>("showTimestamps", { required: true });
const wrap = defineModel<boolean>("wrap", { required: true });
const paused = defineModel<boolean>("paused", { required: true });
const tail = defineModel<number>("tail", { required: true });

defineProps<{
  dropped: number;
  connected: boolean;
}>();

const emit = defineEmits<{
  clear: [];
  download: [];
}>();
</script>

<template>
  <div class="flex flex-wrap items-center gap-3 border-b border-neutral-200 px-3 py-2 text-xs dark:border-neutral-800">
    <input
      v-model="filter"
      type="text"
      placeholder="Filtrar..."
      class="w-48 rounded border border-neutral-300 bg-transparent px-2 py-1 dark:border-neutral-700"
    />

    <label class="flex items-center gap-1">
      <input v-model="showStdout" type="checkbox" />
      stdout
    </label>
    <label class="flex items-center gap-1">
      <input v-model="showStderr" type="checkbox" />
      stderr
    </label>
    <label class="flex items-center gap-1">
      <input v-model="showTimestamps" type="checkbox" />
      timestamps
    </label>
    <label class="flex items-center gap-1">
      <input v-model="wrap" type="checkbox" />
      wrap
    </label>

    <select v-model.number="tail" class="rounded border border-neutral-300 bg-transparent px-1 py-1 dark:border-neutral-700">
      <option :value="100">tail 100</option>
      <option :value="500">tail 500</option>
      <option :value="2000">tail 2000</option>
    </select>

    <button
      class="rounded px-2 py-1 font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800"
      @click="paused = !paused"
    >
      {{ paused ? "Retomar" : "Pausar" }}
    </button>
    <button class="rounded px-2 py-1 font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800" @click="emit('clear')">
      Limpar
    </button>
    <button class="rounded px-2 py-1 font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800" @click="emit('download')">
      Baixar .log
    </button>

    <span v-if="dropped > 0" class="text-amber-600 dark:text-amber-400">
      {{ dropped }} linhas descartadas
    </span>

    <span class="ml-auto flex items-center gap-1 text-neutral-500">
      <span class="h-2 w-2 rounded-full" :class="connected ? 'bg-emerald-500' : 'bg-neutral-400'" />
      {{ connected ? "ao vivo" : "desconectado" }}
    </span>
  </div>
</template>
