<script setup lang="ts">
import { Icon } from "@iconify/vue";

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
  <div class="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-50/50 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-900/40">
    <div class="relative">
      <Icon icon="lucide:search" class="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
      <input
        v-model="filter"
        type="text"
        placeholder="Filtrar..."
        class="w-48 rounded-app-sm border border-slate-300 bg-transparent py-1 pl-7 pr-2 dark:border-slate-700"
      />
    </div>

    <label class="flex items-center gap-1 text-slate-600 dark:text-slate-400">
      <input v-model="showStdout" type="checkbox" />
      stdout
    </label>
    <label class="flex items-center gap-1 text-slate-600 dark:text-slate-400">
      <input v-model="showStderr" type="checkbox" />
      stderr
    </label>
    <label class="flex items-center gap-1 text-slate-600 dark:text-slate-400">
      <input v-model="showTimestamps" type="checkbox" />
      timestamps
    </label>
    <label class="flex items-center gap-1 text-slate-600 dark:text-slate-400">
      <input v-model="wrap" type="checkbox" />
      wrap
    </label>

    <select
      v-model.number="tail"
      title="Quantidade inicial de linhas carregadas"
      class="rounded-app-sm border border-slate-300 bg-transparent px-1 py-1 dark:border-slate-700"
    >
      <option :value="100">tail 100</option>
      <option :value="500">tail 500</option>
      <option :value="2000">tail 2000</option>
    </select>

    <div class="ml-auto flex items-center gap-1">
      <span
        v-if="dropped > 0"
        title="Linhas descartadas do início do buffer para não estourar a memória"
        class="mr-1 flex items-center gap-1 text-amber-600 dark:text-amber-400"
      >
        <Icon icon="lucide:triangle-alert" class="h-3.5 w-3.5" />
        {{ dropped }} descartadas
      </span>

      <button
        :title="paused ? 'Retomar streaming de logs' : 'Pausar streaming — não fecha a conexão'"
        class="flex items-center gap-1 rounded-app-sm px-2 py-1 font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
        @click="paused = !paused"
      >
        <Icon :icon="paused ? 'lucide:play' : 'lucide:pause'" class="h-3.5 w-3.5" />
        {{ paused ? "Retomar" : "Pausar" }}
      </button>
      <button
        title="Limpar linhas exibidas (não afeta o stream)"
        class="flex items-center gap-1 rounded-app-sm px-2 py-1 font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
        @click="emit('clear')"
      >
        <Icon icon="lucide:eraser" class="h-3.5 w-3.5" />
        Limpar
      </button>
      <button
        title="Baixar as linhas visíveis como .log"
        class="flex items-center gap-1 rounded-app-sm px-2 py-1 font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
        @click="emit('download')"
      >
        <Icon icon="lucide:download" class="h-3.5 w-3.5" />
        Baixar .log
      </button>

      <span class="ml-2 flex items-center gap-1 text-slate-500" :title="connected ? 'Recebendo logs ao vivo' : 'Stream desconectado'">
        <Icon
          :icon="connected ? 'lucide:radio' : 'lucide:radio-tower'"
          class="h-3.5 w-3.5"
          :class="connected ? 'text-emerald-500' : 'text-slate-400'"
        />
        {{ connected ? "ao vivo" : "desconectado" }}
      </span>
    </div>
  </div>
</template>
