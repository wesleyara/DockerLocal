import { ref, shallowRef } from "vue";
import type { VolumeFsEntry, VolumeFsListResult } from "@dockerlocal/shared";
import { volumesApi } from "@/api/volumes.api";
import { ApiError } from "@/api/http";

/**
 * Estado local de uma pasta do navegador de volumes — vive na view, não numa
 * store Pinia (mesmo padrão do `useFileBrowser` do host: é estado de uma
 * tela, não um recurso compartilhado entre telas).
 */
export function useVolumeFiles(volumeName: () => string) {
  const path = ref("/");
  const entries = shallowRef<VolumeFsEntry[]>([]);
  const parent = ref<string | null>(null);
  const readOnly = ref(false);
  const truncated = ref(false);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const mutating = ref<Set<string>>(new Set());

  async function load(nextPath: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const result: VolumeFsListResult = await volumesApi.listFiles(volumeName(), nextPath);
      path.value = result.path;
      entries.value = result.entries;
      parent.value = result.parent;
      readOnly.value = result.readOnly;
      truncated.value = result.truncated;
    } catch (err) {
      error.value = err instanceof ApiError ? err.message : "Falha ao listar arquivos";
      entries.value = [];
    } finally {
      loading.value = false;
    }
  }

  async function refresh(): Promise<void> {
    await load(path.value);
  }

  async function mkdir(name: string): Promise<void> {
    const target = joinPath(path.value, name);
    await volumesApi.mkdir(volumeName(), target);
    await refresh();
  }

  async function rename(entry: VolumeFsEntry, newName: string): Promise<void> {
    const to = joinPath(path.value, newName);
    await volumesApi.rename(volumeName(), entry.path, to);
    await refresh();
  }

  async function remove(entry: VolumeFsEntry): Promise<void> {
    mutating.value.add(entry.path);
    try {
      await volumesApi.removeFile(volumeName(), entry.path);
      await refresh();
    } finally {
      mutating.value.delete(entry.path);
    }
  }

  return {
    path,
    entries,
    parent,
    readOnly,
    truncated,
    loading,
    error,
    mutating,
    load,
    refresh,
    mkdir,
    rename,
    remove,
  };
}

export function joinPath(dir: string, name: string): string {
  return dir === "/" ? `/${name}` : `${dir}/${name}`;
}
