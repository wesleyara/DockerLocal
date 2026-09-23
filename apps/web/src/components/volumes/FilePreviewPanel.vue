<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Icon } from "@iconify/vue";
import type { VolumeFsEntry, VolumeFsReadResult } from "@dockerlocal/shared";
import { volumesApi } from "@/api/volumes.api";
import { ApiError } from "@/api/http";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";

const props = defineProps<{
  volume: string;
  entry: VolumeFsEntry | null;
  readOnly: boolean;
}>();

const emit = defineEmits<{ close: []; saved: [] }>();

const { confirm } = useConfirm();
const toast = useToast();

const loading = ref(false);
const preview = ref<VolumeFsReadResult | null>(null);
const editing = ref(false);
const draft = ref("");
const saving = ref(false);
const loadError = ref<string | null>(null);

watch(
  () => props.entry?.path,
  async (path) => {
    editing.value = false;
    preview.value = null;
    loadError.value = null;
    if (!path || props.entry?.type !== "file") return;
    loading.value = true;
    try {
      preview.value = await volumesApi.readFile(props.volume, path);
    } catch (err) {
      loadError.value = err instanceof Error ? err.message : "Falha ao ler arquivo";
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);

const canEdit = computed(
  () => !props.readOnly && preview.value && !preview.value.binary && !preview.value.truncated,
);

function startEdit(): void {
  if (!preview.value) return;
  draft.value = preview.value.content;
  editing.value = true;
}

async function save(overwrite = true): Promise<void> {
  if (!props.entry || !preview.value) return;
  saving.value = true;
  try {
    const blob = new Blob([draft.value], { type: "text/plain" });
    await volumesApi.upload(props.volume, props.entry.path, blob, {
      overwrite,
      expectedMtime: preview.value.mtime,
    });
    toast.success(`"${props.entry.name}" salvo.`);
    editing.value = false;
    preview.value = await volumesApi.readFile(props.volume, props.entry.path);
    emit("saved");
  } catch (err) {
    if (err instanceof ApiError && err.conflict === "modified") {
      const overwriteAnyway = await confirm({
        title: "Arquivo alterado",
        message: `"${props.entry.name}" foi alterado no volume desde que você abriu a prévia. Recarregar perde suas mudanças aqui; sobrescrever perde as de lá.`,
        confirmLabel: "Sobrescrever mesmo assim",
        destructive: true,
      });
      if (overwriteAnyway) {
        preview.value = { ...preview.value, mtime: (await volumesApi.readFile(props.volume, props.entry.path)).mtime };
        await save(true);
      } else {
        preview.value = await volumesApi.readFile(props.volume, props.entry.path);
        editing.value = false;
      }
    } else {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar arquivo");
    }
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div
    v-if="entry"
    class="fixed inset-y-0 right-0 z-40 flex w-full max-w-lg flex-col border-l border-slate-200 bg-white shadow-[var(--shadow-elevated)] dark:border-slate-800 dark:bg-slate-900"
  >
    <div class="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
      <div class="flex min-w-0 items-center gap-2">
        <Icon icon="lucide:file" class="h-4 w-4 shrink-0 text-slate-400" />
        <span class="truncate text-sm font-medium">{{ entry.name }}</span>
      </div>
      <div class="flex shrink-0 items-center gap-1">
        <button
          v-if="canEdit && !editing"
          class="rounded-app-sm px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          @click="startEdit"
        >
          <Icon icon="lucide:pencil" class="mr-1 inline h-3.5 w-3.5" />Editar
        </button>
        <a
          :href="volumesApi.downloadUrl(volume, entry.path)"
          class="rounded-app-sm px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          title="Baixar"
        >
          <Icon icon="lucide:download" class="h-3.5 w-3.5" />
        </a>
        <button
          class="rounded-app-sm p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          @click="emit('close')"
        >
          <Icon icon="lucide:x" class="h-4 w-4" />
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-auto p-4">
      <p v-if="loading" class="text-sm text-slate-500">Carregando…</p>
      <p v-else-if="loadError" class="text-sm text-red-600 dark:text-red-400">{{ loadError }}</p>
      <template v-else-if="preview">
        <div
          v-if="preview.binary"
          class="flex flex-col items-center gap-2 py-10 text-center text-sm text-slate-500"
        >
          <Icon icon="lucide:file-lock-2" class="h-6 w-6" />
          <p>Arquivo binário — sem prévia. Baixe para ver o conteúdo.</p>
        </div>
        <template v-else>
          <p v-if="preview.truncated" class="mb-2 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <Icon icon="lucide:triangle-alert" class="h-3.5 w-3.5" />
            Prévia truncada em 512 KB — baixe para ver o arquivo inteiro.
          </p>
          <textarea
            v-if="editing"
            v-model="draft"
            class="h-full min-h-[60vh] w-full resize-none rounded-app-sm border border-slate-300 bg-slate-50 p-3 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
          />
          <pre
            v-else
            class="whitespace-pre-wrap break-words rounded-app-sm bg-slate-50 p-3 font-mono text-xs dark:bg-slate-950"
          >{{ preview.content }}</pre>
        </template>
      </template>
    </div>

    <div v-if="editing" class="flex justify-end gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-800">
      <button
        class="rounded-app-sm px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        :disabled="saving"
        @click="editing = false"
      >
        Cancelar
      </button>
      <button
        class="rounded-app-sm bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="saving"
        @click="save(true)"
      >
        <Icon v-if="saving" icon="lucide:loader-2" class="mr-1 inline h-3.5 w-3.5 animate-spin" />
        Salvar
      </button>
    </div>
  </div>
</template>
