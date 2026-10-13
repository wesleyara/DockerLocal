export interface AutostopStoppedEntry {
  name: string;
  ok: boolean;
  error?: string;
}

export interface AutostopLastRun {
  /** "boot" = disparado pelo boot da máquina; "manual" = botão "Executar agora". */
  trigger: "boot" | "manual";
  at: number;
  stopped: AutostopStoppedEntry[];
}

export interface AutostopState {
  enabled: boolean;
  /** Nomes de containers que NÃO devem ser parados no boot. */
  excluded: string[];
  lastRun: AutostopLastRun | null;
}
