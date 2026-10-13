<script setup lang="ts">
import { computed, ref } from "vue";
import { Icon } from "@iconify/vue";
import type { ImageScanResult, VulnerabilitySeverity } from "@dockerlocal/shared";

const props = defineProps<{
  result: ImageScanResult;
}>();

const SEVERITY_ORDER: VulnerabilitySeverity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN"];

const SEVERITY_TONE: Record<VulnerabilitySeverity, string> = {
  CRITICAL: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  HIGH: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  MEDIUM: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  LOW: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  UNKNOWN: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

const totalCount = computed(() =>
  SEVERITY_ORDER.reduce((sum, s) => sum + props.result.summary[s], 0),
);

const tab = ref<"vulnerable" | "clean">("vulnerable");
const search = ref("");
const activeSeverities = ref<Set<VulnerabilitySeverity>>(new Set());

function toggleSeverity(sev: VulnerabilitySeverity): void {
  tab.value = "vulnerable";
  const next = new Set(activeSeverities.value);
  if (next.has(sev)) {
    next.delete(sev);
  } else {
    next.add(sev);
  }
  activeSeverities.value = next;
}

function clearFilters(): void {
  search.value = "";
  activeSeverities.value = new Set();
}

const vulnerableRows = computed(() => {
  const term = search.value.trim().toLowerCase();
  return props.result.vulnerabilities.filter((v) => {
    if (activeSeverities.value.size > 0 && !activeSeverities.value.has(v.severity)) return false;
    if (!term) return true;
    return (
      v.id.toLowerCase().includes(term) ||
      v.pkgName.toLowerCase().includes(term) ||
      (v.title?.toLowerCase().includes(term) ?? false)
    );
  });
});

const cleanRows = computed(() => {
  const term = search.value.trim().toLowerCase();
  if (!term) return props.result.cleanPackages;
  return props.result.cleanPackages.filter((p) => p.name.toLowerCase().includes(term));
});

const hasFilters = computed(() => search.value.trim() !== "" || activeSeverities.value.size > 0);
</script>

<template>
  <div class="flex flex-1 flex-col overflow-hidden">
    <div class="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3 text-xs dark:border-slate-800">
      <button
        v-for="sev in SEVERITY_ORDER"
        :key="sev"
        type="button"
        class="rounded-full px-2 py-0.5 font-medium ring-2 ring-offset-1 ring-offset-white transition dark:ring-offset-slate-950"
        :class="[
          SEVERITY_TONE[sev],
          activeSeverities.has(sev) ? 'ring-current' : 'ring-transparent',
          activeSeverities.size > 0 && !activeSeverities.has(sev) ? 'opacity-40' : '',
        ]"
        :title="`Filtrar por ${sev}`"
        @click="toggleSeverity(sev)"
      >
        {{ sev }}: {{ result.summary[sev] }}
      </button>
      <span class="ml-auto text-slate-400">
        trivy {{ result.trivyVersion }}<span v-if="result.os"> · {{ result.os }}</span>
      </span>
    </div>

    <div class="flex items-center gap-1 border-b border-slate-200 px-4 pt-2 text-xs dark:border-slate-800">
      <button
        type="button"
        class="rounded-t-app-sm border-b-2 px-3 py-1.5 font-medium"
        :class="
          tab === 'vulnerable'
            ? 'border-blue-600 text-blue-700 dark:text-blue-400'
            : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
        "
        @click="tab = 'vulnerable'"
      >
        Vulneráveis ({{ result.vulnerabilities.length }})
      </button>
      <button
        type="button"
        class="rounded-t-app-sm border-b-2 px-3 py-1.5 font-medium"
        :class="
          tab === 'clean'
            ? 'border-blue-600 text-blue-700 dark:text-blue-400'
            : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
        "
        @click="tab = 'clean'"
      >
        Sem CVE ({{ result.cleanPackages.length }})
      </button>
    </div>

    <div class="flex items-center gap-2 border-b border-slate-200 px-4 py-2 dark:border-slate-800">
      <Icon icon="lucide:search" class="h-3.5 w-3.5 shrink-0 text-slate-400" />
      <input
        v-model="search"
        type="text"
        :placeholder="
          tab === 'vulnerable' ? 'Filtrar por CVE, pacote ou descrição…' : 'Filtrar por nome do pacote…'
        "
        class="w-full bg-transparent text-xs outline-none placeholder:text-slate-400"
      />
      <button
        v-if="hasFilters"
        type="button"
        class="shrink-0 rounded-app-sm px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
        @click="clearFilters"
      >
        Limpar
      </button>
    </div>

    <template v-if="tab === 'vulnerable'">
      <div v-if="totalCount === 0" class="flex flex-1 items-center justify-center px-4 py-8 text-sm text-slate-400">
        Nenhuma vulnerabilidade conhecida encontrada.
      </div>
      <div
        v-else-if="vulnerableRows.length === 0"
        class="flex flex-1 items-center justify-center px-4 py-8 text-sm text-slate-400"
      >
        Nenhuma vulnerabilidade corresponde ao filtro.
      </div>
      <div v-else class="flex-1 overflow-auto">
        <table class="w-full border-collapse text-left text-xs">
          <thead class="sticky top-0 bg-white dark:bg-slate-950">
            <tr class="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <th class="px-4 py-2 font-medium">Severidade</th>
              <th class="px-2 py-2 font-medium">CVE</th>
              <th class="px-2 py-2 font-medium">Pacote</th>
              <th class="px-2 py-2 font-medium">Instalada</th>
              <th class="px-2 py-2 font-medium">Corrigida em</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="v in vulnerableRows"
              :key="`${v.target}-${v.pkgName}-${v.id}`"
              class="border-b border-slate-100 align-top hover:bg-slate-50 dark:border-slate-900 dark:hover:bg-slate-900/50"
            >
              <td class="px-4 py-2">
                <span class="rounded-full px-2 py-0.5 font-medium" :class="SEVERITY_TONE[v.severity]">
                  {{ v.severity }}
                </span>
              </td>
              <td class="px-2 py-2 font-mono">
                <a
                  v-if="v.primaryUrl"
                  :href="v.primaryUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-blue-600 hover:underline dark:text-blue-400"
                >
                  {{ v.id }}
                </a>
                <span v-else>{{ v.id }}</span>
                <p v-if="v.title" class="mt-0.5 max-w-xs font-sans text-slate-400">{{ v.title }}</p>
              </td>
              <td class="px-2 py-2 font-mono">{{ v.pkgName }}</td>
              <td class="px-2 py-2 font-mono text-slate-500">{{ v.installedVersion }}</td>
              <td class="px-2 py-2 font-mono text-slate-500">{{ v.fixedVersion ?? "—" }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <template v-else>
      <div
        v-if="result.cleanPackages.length === 0"
        class="flex flex-1 items-center justify-center px-4 py-8 text-sm text-slate-400"
      >
        Nenhum pacote sem vulnerabilidade identificado.
      </div>
      <div
        v-else-if="cleanRows.length === 0"
        class="flex flex-1 items-center justify-center px-4 py-8 text-sm text-slate-400"
      >
        Nenhum pacote corresponde ao filtro.
      </div>
      <div v-else class="flex-1 overflow-auto">
        <table class="w-full border-collapse text-left text-xs">
          <thead class="sticky top-0 bg-white dark:bg-slate-950">
            <tr class="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <th class="px-4 py-2 font-medium">Pacote</th>
              <th class="px-2 py-2 font-medium">Versão</th>
              <th class="px-2 py-2 font-medium">Alvo</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="p in cleanRows"
              :key="`${p.target}-${p.name}-${p.version}`"
              class="border-b border-slate-100 align-top hover:bg-slate-50 dark:border-slate-900 dark:hover:bg-slate-900/50"
            >
              <td class="px-4 py-2 font-mono">{{ p.name }}</td>
              <td class="px-2 py-2 font-mono text-slate-500">{{ p.version }}</td>
              <td class="max-w-xs truncate px-2 py-2 font-mono text-slate-400" :title="p.target">
                {{ p.target }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
