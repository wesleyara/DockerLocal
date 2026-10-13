import { computed, ref, type ComputedRef, type Ref } from "vue";

export type SortDirection = "asc" | "desc";
export type SortAccessor<T> = (item: T) => string | number;

/**
 * Ordenação client-side por coluna. Não busca nada novo — ordena o array já
 * carregado na store. `accessors` mapeia a chave da coluna (usada no header)
 * para o valor comparável do item.
 */
export function useSortableTable<T>(
  items: Ref<T[]> | ComputedRef<T[]>,
  accessors: Record<string, SortAccessor<T>>,
  initialKey: string | null = null,
) {
  const sortKey = ref<string | null>(initialKey);
  const sortDir = ref<SortDirection>("asc");

  function toggleSort(key: string): void {
    if (!(key in accessors)) return;
    if (sortKey.value === key) {
      sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
    } else {
      sortKey.value = key;
      sortDir.value = "asc";
    }
  }

  const sorted = computed(() => {
    if (!sortKey.value) return items.value;
    const accessor = accessors[sortKey.value];
    if (!accessor) return items.value;
    const dir = sortDir.value === "asc" ? 1 : -1;
    return [...items.value].sort((a, b) => {
      const av = accessor(a);
      const bv = accessor(b);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  });

  return { sorted, sortKey, sortDir, toggleSort };
}
