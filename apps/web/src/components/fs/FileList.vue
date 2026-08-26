<script setup lang="ts">
import { computed } from "vue";
import { Icon } from "@iconify/vue";
import type { FsEntry } from "@dockerlocal/shared";
import type { FileBrowserMode } from "@/composables/useFileBrowser";

const props = defineProps<{
  path: string;
  root: string;
  rootLabel: string;
  entries: FsEntry[];
  mode: FileBrowserMode;
  selectedPath: string | null;
  suggestedNames: Set<string>;
}>();

const emit = defineEmits<{
  navigate: [path: string];
  select: [entry: FsEntry];
}>();

// Breadcrumb clicável, mas só até a raiz — não existe segmento acima dela.
const crumbs = computed(() => {
  const rel = props.path.slice(props.root.length).split("/").filter(Boolean);
  const items: { label: string; path: string }[] = [{ label: props.rootLabel, path: props.root }];
  let acc = props.root;
  for (const segment of rel) {
    acc = `${acc}/${segment}`;
    items.push({ label: segment, path: acc });
  }
  return items;
});

function entryMatchesMode(entry: FsEntry): boolean {
  if (props.mode === "dir") return entry.isDirectory;
  if (props.mode === "compose") return entry.isCompose;
  return entry.isDockerfile;
}

function iconFor(entry: FsEntry): string {
  if (entry.isDirectory) return "lucide:folder";
  if (entry.isCompose) return "lucide:file-cog";
  if (entry.isDockerfile) return "lucide:file-terminal";
  return "lucide:file";
}

function onEntryClick(entry: FsEntry): void {
  if (entry.isDirectory) {
    emit("navigate", entry.path);
  } else {
    emit("select", entry);
  }
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <nav class="flex flex-wrap items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
      <template v-for="(crumb, i) in crumbs" :key="crumb.path">
        <button
          type="button"
          class="rounded-app-sm px-1.5 py-0.5 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          :class="{ 'font-semibold text-slate-800 dark:text-slate-100': i === crumbs.length - 1 }"
          @click="emit('navigate', crumb.path)"
        >
          {{ crumb.label }}
        </button>
        <Icon v-if="i < crumbs.length - 1" icon="lucide:chevron-right" class="h-3 w-3 shrink-0" />
      </template>
    </nav>

    <ul class="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-app-md border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
      <li v-if="entries.length === 0" class="px-3 py-6 text-center text-xs text-slate-500">
        Pasta vazia.
      </li>
      <li
        v-for="entry in entries"
        :key="entry.path"
        class="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/60"
        :class="{
          'bg-[var(--color-accent)]/10': entry.path === selectedPath,
          'ring-1 ring-inset ring-amber-300 dark:ring-amber-700': suggestedNames.has(entry.name),
        }"
        @click="onEntryClick(entry)"
      >
        <Icon :icon="iconFor(entry)" class="h-4 w-4 shrink-0 text-slate-400" />
        <span class="min-w-0 flex-1 truncate">{{ entry.name }}</span>
        <Icon
          v-if="suggestedNames.has(entry.name)"
          icon="lucide:sparkles"
          class="h-3.5 w-3.5 shrink-0 text-amber-500"
          title="Sugestão"
        />
        <Icon
          v-if="!entry.isDirectory && entryMatchesMode(entry)"
          icon="lucide:check"
          class="h-3.5 w-3.5 shrink-0 text-emerald-500"
        />
      </li>
    </ul>
  </div>
</template>
