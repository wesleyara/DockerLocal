import { computed, reactive, ref, shallowRef } from "vue";
import { defineStore } from "pinia";
import type { ImageSummary } from "@dockerlocal/shared";
import { imagesApi } from "@/api/images.api";

export const useImagesStore = defineStore("images", () => {
  const items = shallowRef<ImageSummary[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const pending = reactive(new Set<string>());

  let inFlight: Promise<void> | null = null;

  async function fetch(force = false): Promise<void> {
    if (inFlight && !force) return inFlight;

    loading.value = true;
    inFlight = imagesApi
      .list({ all: true })
      .then((result) => {
        items.value = result;
        error.value = null;
      })
      .catch((err: unknown) => {
        error.value = err instanceof Error ? err.message : "Falha ao carregar imagens";
      })
      .finally(() => {
        loading.value = false;
        inFlight = null;
      });

    return inFlight;
  }

  async function remove(id: string, opts?: { force?: boolean; noprune?: boolean }): Promise<void> {
    pending.add(id);
    try {
      await imagesApi.remove(id, opts);
      await fetch(true);
    } finally {
      pending.delete(id);
    }
  }

  async function prune(danglingOnly = true): Promise<unknown> {
    const result = await imagesApi.prune(danglingOnly);
    await fetch(true);
    return result;
  }

  const danglingCount = computed(() => items.value.filter((i) => i.dangling).length);

  return { items, loading, error, pending, fetch, remove, prune, danglingCount };
});
