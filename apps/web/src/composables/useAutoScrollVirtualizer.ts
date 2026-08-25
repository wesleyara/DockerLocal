import { nextTick, ref, watch, type Ref } from "vue";
import { useVirtualizer } from "@tanstack/vue-virtual";

/**
 * Scroll automático até o fim + virtualização — mesmo comportamento usado
 * pelo LogViewer (logs de container) e pelo TaskOutput (saída de task):
 * segue novas linhas só enquanto o usuário está no fundo da lista.
 *
 * `scrollEl` é declarado no componente chamador (não aqui) — vue-tsc só liga
 * um `ref="x"` de template a um binding que reconheça sintaticamente como
 * `ref()`; devolvido por uma função comum, ele soma como não-usado.
 */
export function useAutoScrollVirtualizer(
  scrollEl: Ref<HTMLDivElement | null>,
  count: () => number,
  estimateSize = 20,
) {
  const atBottom = ref(true);

  const virtualizer = useVirtualizer({
    get count() {
      return count();
    },
    getScrollElement: () => scrollEl.value,
    estimateSize: () => estimateSize,
    overscan: 20,
  });

  function isAtBottom(): boolean {
    const el = scrollEl.value;
    if (!el) return true;
    return el.scrollTop + el.clientHeight >= el.scrollHeight - 8;
  }

  function handleScroll(): void {
    atBottom.value = isAtBottom();
  }

  function scrollToBottom(): void {
    if (count() === 0) return;
    virtualizer.value.scrollToIndex(count() - 1, { align: "end" });
    atBottom.value = true;
  }

  watch(count, async () => {
    if (!atBottom.value) return;
    await nextTick();
    scrollToBottom();
  });

  return { atBottom, virtualizer, handleScroll, scrollToBottom };
}

export type AutoScrollVirtualizer = ReturnType<typeof useAutoScrollVirtualizer>;
