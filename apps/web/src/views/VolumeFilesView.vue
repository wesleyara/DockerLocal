<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Icon } from "@iconify/vue";
import type { VolumeFsEntry } from "@dockerlocal/shared";
import { useVolumeFiles, joinPath } from "@/composables/useVolumeFiles";
import { useVolumesStore } from "@/stores/volumes.store";
import { useContainersStore } from "@/stores/containers.store";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import { useSortableTable } from "@/composables/useSortableTable";
import { volumesApi } from "@/api/volumes.api";
import { formatBytes } from "@/utils/format";
import EmptyState from "@/components/common/EmptyState.vue";
import ErrorBanner from "@/components/common/ErrorBanner.vue";
import TableSkeleton from "@/components/common/TableSkeleton.vue";
import SortableHeader from "@/components/common/SortableHeader.vue";
import RelativeTime from "@/components/common/RelativeTime.vue";
import FilePreviewPanel from "@/components/volumes/FilePreviewPanel.vue";

const route = useRoute();
const router = useRouter();
const volumesStore = useVolumesStore();
const containersStore = useContainersStore();
const { confirm } = useConfirm();
const toast = useToast();

const volumeName = computed(() => String(route.params.name));
const routePath = computed(() => {
  const raw = route.params.path;
  const segments = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return segments.length === 0 ? "/" : `/${segments.join("/")}`;
});

const { path, entries, readOnly, truncated, loading, error, mutating, load, refresh, mkdir, rename, remove } =
  useVolumeFiles(() => volumeName.value);

const selectedEntry = ref<VolumeFsEntry | null>(null);
const dragOver = ref(false);
const uploadQueue = ref<{ name: string; pct: number }[]>([]);
const folderInput = ref<HTMLInputElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

watch(
  routePath,
  (p) => {
    selectedEntry.value = null;
    load(p);
  },
  { immediate: true },
);

onMounted(() => {
  volumesStore.fetch();
  containersStore.fetch();
});

const volume = computed(() => volumesStore.items.find((v) => v.name === volumeName.value));

const runningUsedBy = computed(() => {
  const usedBy = volume.value?.usedBy ?? [];
  if (usedBy.length === 0) return [];
  const running = new Set(
    containersStore.items.filter((c) => c.state === "running").map((c) => c.name),
  );
  return usedBy.filter((n) => running.has(n));
});

const itemsRef = computed(() => entries.value);
const { sorted, sortKey, sortDir, toggleSort } = useSortableTable(itemsRef, {
  name: (e) => e.name,
  size: (e) => e.size,
  modifiedAt: (e) => e.modifiedAt,
});

const crumbs = computed(() => {
  const segments = path.value.split("/").filter(Boolean);
  const items: { label: string; path: string }[] = [{ label: volumeName.value, path: "/" }];
  let acc = "";
  for (const segment of segments) {
    acc += `/${segment}`;
    items.push({ label: segment, path: acc });
  }
  return items;
});

function navigate(target: string): void {
  const segments = target.split("/").filter(Boolean);
  router.push({ name: "volume-files", params: { name: volumeName.value, path: segments } });
}

function onEntryClick(entry: VolumeFsEntry): void {
  if (entry.type === "directory") {
    navigate(entry.path);
  } else {
    selectedEntry.value = entry;
  }
}

function iconFor(entry: VolumeFsEntry): string {
  if (entry.type === "directory") return "lucide:folder";
  if (entry.type === "symlink") return "lucide:link";
  return "lucide:file";
}

async function handleMkdir(): Promise<void> {
  const name = window.prompt("Nome da nova pasta:");
  if (!name) return;
  try {
    await mkdir(name);
    toast.success(`Pasta "${name}" criada.`);
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Falha ao criar pasta");
  }
}

async function handleRename(entry: VolumeFsEntry): Promise<void> {
  const name = window.prompt("Novo nome:", entry.name);
  if (!name || name === entry.name) return;
  try {
    await rename(entry, name);
    toast.success(`Renomeado para "${name}".`);
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Falha ao renomear");
  }
}

async function handleRemove(entry: VolumeFsEntry): Promise<void> {
  const ok = await confirm({
    title: entry.type === "directory" ? "Apagar pasta" : "Apagar arquivo",
    message:
      entry.type === "directory"
        ? `Apaga "${entry.name}" e tudo dentro, sem volta.`
        : `Apaga "${entry.name}" permanentemente, sem volta.`,
    confirmLabel: "Apagar",
    requireTypedName: entry.type === "directory" ? entry.name : undefined,
  });
  if (!ok) return;
  try {
    await remove(entry);
    if (selectedEntry.value?.path === entry.path) selectedEntry.value = null;
    toast.success(`"${entry.name}" apagado.`);
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Falha ao apagar");
  }
}

async function uploadOne(relativePath: string, file: File): Promise<void> {
  const target = joinPath(path.value, relativePath);
  const entry = { name: relativePath, pct: 0 };
  uploadQueue.value.push(entry);
  try {
    await volumesApi.upload(volumeName.value, target, file, {
      onProgress: (pct) => (entry.pct = pct),
    });
  } catch (err) {
    if (err && typeof err === "object" && "statusCode" in err && (err as { statusCode: number }).statusCode === 409) {
      const overwrite = await confirm({
        title: "Substituir arquivo?",
        message: `"${relativePath}" já existe em "${path.value}".`,
        confirmLabel: "Substituir",
      });
      if (overwrite) {
        await volumesApi.upload(volumeName.value, target, file, { overwrite: true, onProgress: (pct) => (entry.pct = pct) });
      } else {
        return;
      }
    } else {
      toast.error(err instanceof Error ? err.message : `Falha ao enviar "${relativePath}"`);
      return;
    }
  } finally {
    uploadQueue.value = uploadQueue.value.filter((u) => u !== entry);
  }
}

async function uploadFiles(files: File[]): Promise<void> {
  if (readOnly.value) return;
  for (const file of files) {
    // webkitRelativePath preserva a hierarquia num upload de pasta arrastada/selecionada.
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    await uploadOne(rel, file);
  }
  await refresh();
}

function onFileInputChange(evt: Event): void {
  const input = evt.target as HTMLInputElement;
  if (input.files) void uploadFiles(Array.from(input.files));
  input.value = "";
}

function onDrop(evt: DragEvent): void {
  dragOver.value = false;
  if (readOnly.value || !evt.dataTransfer) return;
  void uploadFiles(Array.from(evt.dataTransfer.files));
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex min-w-0 items-center gap-2">
        <button
          class="rounded-app-sm p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          title="Voltar para Volumes"
          @click="router.push({ name: 'volumes' })"
        >
          <Icon icon="lucide:arrow-left" class="h-4 w-4" />
        </button>
        <h1 class="page-title flex items-center gap-2 truncate">
          <Icon icon="lucide:folder-open" class="h-4.5 w-4.5 text-slate-400" />
          {{ volumeName }}
        </h1>
        <span
          v-if="readOnly"
          class="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
        >
          Somente leitura
        </span>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button
          class="flex items-center gap-1.5 rounded-app-sm px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          @click="refresh"
        >
          <Icon icon="lucide:refresh-cw" class="h-3.5 w-3.5" />
          Atualizar
        </button>
        <template v-if="!readOnly">
          <button
            class="flex items-center gap-1.5 rounded-app-sm px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            @click="handleMkdir"
          >
            <Icon icon="lucide:folder-plus" class="h-3.5 w-3.5" />
            Nova pasta
          </button>
          <button
            class="flex items-center gap-1.5 rounded-app-sm px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            @click="fileInput?.click()"
          >
            <Icon icon="lucide:upload" class="h-3.5 w-3.5" />
            Enviar arquivos
          </button>
          <button
            class="flex items-center gap-1.5 rounded-app-sm px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            @click="folderInput?.click()"
          >
            <Icon icon="lucide:folder-up" class="h-3.5 w-3.5" />
            Enviar pasta
          </button>
          <input ref="fileInput" type="file" multiple class="hidden" @change="onFileInputChange" />
          <input
            ref="folderInput"
            type="file"
            multiple
            webkitdirectory
            class="hidden"
            @change="onFileInputChange"
          />
        </template>
      </div>
    </div>

    <div
      v-if="runningUsedBy.length > 0"
      class="flex items-center gap-2 rounded-app-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
    >
      <Icon icon="lucide:triangle-alert" class="h-4 w-4 shrink-0" />
      Em uso por {{ runningUsedBy.join(", ") }} — alterar arquivos com o container rodando pode corromper dados.
    </div>

    <nav class="flex flex-wrap items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
      <template v-for="(crumb, i) in crumbs" :key="crumb.path">
        <button
          type="button"
          class="rounded-app-sm px-1.5 py-0.5 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          :class="{ 'font-semibold text-slate-800 dark:text-slate-100': i === crumbs.length - 1 }"
          @click="navigate(crumb.path)"
        >
          {{ crumb.label }}
        </button>
        <Icon v-if="i < crumbs.length - 1" icon="lucide:chevron-right" class="h-3 w-3 shrink-0" />
      </template>
    </nav>

    <div
      v-for="upload in uploadQueue"
      :key="upload.name"
      class="flex items-center gap-2 text-xs text-slate-500"
    >
      <Icon icon="lucide:loader-2" class="h-3.5 w-3.5 animate-spin" />
      Enviando {{ upload.name }} — {{ upload.pct }}%
    </div>

    <p v-if="truncated" class="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
      <Icon icon="lucide:triangle-alert" class="h-3.5 w-3.5" />
      Mostrando as primeiras 5000 entradas — a pasta tem mais itens.
    </p>

    <ErrorBanner v-if="error" :message="error" />

    <TableSkeleton
      v-else-if="loading && entries.length === 0"
      :columns="5"
      class="card-surface overflow-hidden rounded-app-lg border border-slate-200/80 dark:border-slate-800"
    />

    <EmptyState v-else-if="!loading && entries.length === 0" message="Pasta vazia." icon="lucide:folder" />

    <div
      v-else
      class="card-surface overflow-x-auto rounded-app-lg border border-slate-200/80 dark:border-slate-800"
      :class="{ 'ring-2 ring-[var(--color-accent)]': dragOver }"
      @dragover.prevent="dragOver = true"
      @dragleave.prevent="dragOver = false"
      @drop.prevent="onDrop"
    >
      <table class="w-full border-collapse text-sm">
        <thead>
          <tr class="border-b border-slate-200 bg-slate-50/60 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
            <SortableHeader sort-key="name" :active-key="sortKey" :direction="sortDir" @sort="toggleSort">Nome</SortableHeader>
            <SortableHeader sort-key="size" :active-key="sortKey" :direction="sortDir" @sort="toggleSort" align="right">Tamanho</SortableHeader>
            <SortableHeader sort-key="modifiedAt" :active-key="sortKey" :direction="sortDir" @sort="toggleSort">Modificado</SortableHeader>
            <th class="px-3 py-2 col-label text-slate-500 dark:text-slate-400">Dono</th>
            <th class="px-3 py-2 col-label text-right text-slate-500 dark:text-slate-400">Ações</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="entry in sorted"
            :key="entry.path"
            class="cursor-pointer border-b border-slate-100 transition-colors last:border-b-0 hover:bg-slate-50 dark:border-slate-900 dark:hover:bg-slate-800/40"
            :class="{ 'pointer-events-none opacity-40': mutating.has(entry.path) }"
            @click="onEntryClick(entry)"
          >
            <td class="px-3 py-2 font-medium">
              <div class="flex items-center gap-2">
                <Icon :icon="iconFor(entry)" class="h-4 w-4 shrink-0 text-slate-400" />
                <span class="truncate">{{ entry.name }}</span>
              </div>
            </td>
            <td class="tabular px-3 py-2 text-right text-slate-500">
              {{ entry.type === "directory" ? "—" : formatBytes(entry.size) }}
            </td>
            <td class="px-3 py-2 text-slate-500">
              <RelativeTime :timestamp="Math.floor(new Date(entry.modifiedAt).getTime() / 1000)" />
            </td>
            <td class="px-3 py-2 font-mono text-xs text-slate-500">{{ entry.uid }}:{{ entry.gid }}</td>
            <td class="px-3 py-2" @click.stop>
              <div class="flex items-center justify-end gap-1">
                <a
                  v-if="entry.type !== 'directory'"
                  :href="volumesApi.downloadUrl(volumeName, entry.path)"
                  class="rounded-app-sm p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  title="Baixar"
                >
                  <Icon icon="lucide:download" class="h-3.5 w-3.5" />
                </a>
                <a
                  v-else
                  :href="volumesApi.downloadUrl(volumeName, entry.path)"
                  class="rounded-app-sm p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  title="Baixar como .tar"
                >
                  <Icon icon="lucide:archive" class="h-3.5 w-3.5" />
                </a>
                <template v-if="!readOnly">
                  <button
                    class="rounded-app-sm p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    title="Renomear"
                    @click="handleRename(entry)"
                  >
                    <Icon icon="lucide:pencil" class="h-3.5 w-3.5" />
                  </button>
                  <button
                    class="rounded-app-sm p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
                    title="Apagar"
                    @click="handleRemove(entry)"
                  >
                    <Icon icon="lucide:trash-2" class="h-3.5 w-3.5" />
                  </button>
                </template>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <FilePreviewPanel
      :volume="volumeName"
      :entry="selectedEntry"
      :read-only="readOnly"
      @close="selectedEntry = null"
      @saved="refresh"
    />
  </div>
</template>
