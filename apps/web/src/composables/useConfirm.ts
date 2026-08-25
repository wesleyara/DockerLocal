import { ref } from "vue";

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  requireTypedName?: string;
  /** false para confirmações não-destrutivas (ex.: "Entendi") — omite o ícone de alerta e o vermelho. */
  destructive?: boolean;
}

const isOpen = ref(false);
const options = ref<ConfirmOptions>({ title: "", message: "" });
let resolver: ((value: boolean) => void) | null = null;

export function useConfirm() {
  function confirm(opts: ConfirmOptions): Promise<boolean> {
    options.value = opts;
    isOpen.value = true;
    return new Promise((resolve) => {
      resolver = resolve;
    });
  }

  function resolve(value: boolean): void {
    isOpen.value = false;
    resolver?.(value);
    resolver = null;
  }

  return { isOpen, options, confirm, resolve };
}
