import { ref } from "vue";

export type FileBrowserMode = "compose" | "dockerfile" | "dir";

export interface FileBrowserOptions {
  mode: FileBrowserMode;
  title?: string;
}

const isOpen = ref(false);
const options = ref<FileBrowserOptions>({ mode: "dir" });
let resolver: ((value: string | null) => void) | null = null;

/** Diálogo global de seleção de arquivo, no mesmo padrão promise-based do useConfirm. */
export function useFileBrowser() {
  function open(opts: FileBrowserOptions): Promise<string | null> {
    options.value = opts;
    isOpen.value = true;
    return new Promise((resolve) => {
      resolver = resolve;
    });
  }

  function resolve(value: string | null): void {
    isOpen.value = false;
    resolver?.(value);
    resolver = null;
  }

  return { isOpen, options, open, resolve };
}
