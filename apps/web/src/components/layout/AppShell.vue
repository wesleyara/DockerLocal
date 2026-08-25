<script setup lang="ts">
import SideNav from "./SideNav.vue";
import StatusBar from "./StatusBar.vue";
import ConfirmDialog from "@/components/common/ConfirmDialog.vue";
</script>

<template>
  <div class="flex h-full flex-col bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
    <div class="flex flex-1 overflow-hidden">
      <SideNav />
      <main class="flex-1 overflow-auto p-6">
        <RouterView />
      </main>
    </div>
    <StatusBar />
    <ConfirmDialog />
  </div>
</template>
