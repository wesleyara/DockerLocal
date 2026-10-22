<script setup lang="ts">
import { computed, watch } from "vue";
import { useRoute } from "vue-router";
import { Icon } from "@iconify/vue";
import { useUiStore } from "@/stores/ui.store";
import { useTasksStore } from "@/stores/tasks.store";

const links = [
  { to: "/containers", label: "Containers", icon: "lucide:box" },
  { to: "/images", label: "Images", icon: "lucide:layers" },
  { to: "/volumes", label: "Volumes", icon: "lucide:database" },
  { to: "/stacks", label: "Stacks", icon: "lucide:boxes" },
  { to: "/autostop", label: "Auto-stop", icon: "lucide:power" },
  { to: "/maintenance", label: "Manutenção", icon: "lucide:sparkles" },
  { to: "/settings", label: "Configurações", icon: "lucide:settings" },
];

const ui = useUiStore();
const tasks = useTasksStore();

// Seções com task rodando — o ponto some quando termina.
const busyPaths = computed(() => {
  const paths = new Set<string>();
  for (const t of tasks.running) {
    if (t.kind.startsWith("compose-")) {
      paths.add("/stacks");
      paths.add("/containers");
    } else if (t.kind.startsWith("image-")) {
      paths.add("/images");
    }
  }
  return paths;
});
const route = useRoute();

// No mobile o menu é um drawer — fecha sozinho ao trocar de rota.
watch(() => route.path, () => ui.closeMobileNav());
</script>

<template>
  <div
    v-if="ui.mobileNavOpen"
    class="fixed inset-0 z-40 bg-black/40 sm:hidden"
    @click="ui.closeMobileNav()"
  />

  <nav
    class="fixed inset-y-0 left-0 z-50 flex w-56 shrink-0 -translate-x-full flex-col gap-1 border-r border-slate-200 bg-slate-50 p-3 transition-transform duration-200 sm:static sm:z-auto sm:w-48 sm:translate-x-0 dark:border-slate-800 dark:bg-slate-900"
    :class="{ 'translate-x-0': ui.mobileNavOpen }"
  >
    <div class="mb-2 flex items-center justify-between px-1 sm:hidden">
      <span class="text-sm font-semibold">DockerLocal</span>
      <button
        type="button"
        title="Fechar menu"
        class="rounded-app-sm p-1.5 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800"
        @click="ui.closeMobileNav()"
      >
        <Icon icon="lucide:x" class="h-4 w-4" />
      </button>
    </div>

    <RouterLink
      v-for="link in links"
      :key="link.to"
      :to="link.to"
      class="flex items-center gap-2.5 rounded-app-sm px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800"
      active-class="bg-[var(--color-accent)]! text-white! hover:bg-[var(--color-accent)]! dark:hover:bg-[var(--color-accent)]!"
    >
      <Icon :icon="link.icon" class="h-4 w-4 shrink-0" />
      {{ link.label }}
      <Icon
        v-if="busyPaths.has(link.to)"
        icon="lucide:loader-2"
        class="ml-auto h-3.5 w-3.5 shrink-0 animate-spin"
        title="Task em andamento"
      />
    </RouterLink>
  </nav>
</template>
