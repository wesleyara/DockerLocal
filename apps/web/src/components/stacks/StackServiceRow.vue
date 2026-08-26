<script setup lang="ts">
import type { StackService } from "@dockerlocal/shared";
import { Icon } from "@iconify/vue";
import StateBadge from "@/components/common/StateBadge.vue";
import RelativeTime from "@/components/common/RelativeTime.vue";
import SelfBadge from "@/components/common/SelfBadge.vue";

defineProps<{ service: StackService }>();

function portLabel(p: { public?: number; private: number; type: string }): string {
  return p.public ? `${p.public}:${p.private}` : `${p.private}/${p.type}`;
}
</script>

<template>
  <div class="rounded-app-sm border border-slate-100 dark:border-slate-800">
    <div class="flex items-center gap-2 bg-slate-50 px-3 py-1.5 text-xs font-medium dark:bg-slate-900">
      <Icon icon="lucide:server" class="h-3.5 w-3.5 text-slate-400" />
      {{ service.name }}
      <span class="text-slate-500">({{ service.containers.length }})</span>
    </div>
    <div class="divide-y divide-slate-100 dark:divide-slate-800">
      <div
        v-for="c in service.containers"
        :key="c.id"
        class="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-xs"
      >
        <router-link :to="`/containers/${c.id}/logs`" class="font-mono hover:underline">
          {{ c.name }}
        </router-link>
        <SelfBadge v-if="c.isSelf" />
        <StateBadge :state="c.state" />
        <span class="text-slate-500">{{ c.image }}</span>
        <span v-if="c.ports.length" class="text-slate-500">
          {{ c.ports.map(portLabel).join(", ") }}
        </span>
        <RelativeTime :timestamp="c.createdAt" class="ml-auto text-slate-400" />
      </div>
    </div>
  </div>
</template>
