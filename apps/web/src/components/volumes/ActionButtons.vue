<script setup lang="ts">
import { computed } from "vue";
import type { VolumeSummary } from "@dockerlocal/shared";
import { Icon } from "@iconify/vue";
import { useVolumesStore } from "@/stores/volumes.store";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import { ApiError } from "@/api/http";

const props = defineProps<{
  volume: VolumeSummary;
  pending: boolean;
}>();

const store = useVolumesStore();
const { confirm } = useConfirm();
const toast = useToast();

const inUse = computed(() => props.volume.usedBy.length > 0);
const disabled = computed(() => inUse.value || props.volume.isSelf);

async function handleRemove(): Promise<void> {
  const ok = await confirm({
    title: "Remover volume",
    message: `Essa ação apaga os dados do volume "${props.volume.name}" permanentemente, sem volta.`,
    confirmLabel: "Remover",
  });
  if (!ok) return;

  try {
    await store.remove(props.volume.name);
    toast.success(`Volume "${props.volume.name}" removido.`);
  } catch (err) {
    if (err instanceof ApiError && err.canForce) {
      // Corrida rara: o volume passou a estar em uso entre a listagem e o
      // clique. Não oferecemos forçar aqui — o usuário precisa remover o
      // container antes.
      await confirm({
        title: "Volume em uso",
        message: `${err.message} Remova ou pare o container antes de remover o volume.`,
        confirmLabel: "Entendi",
        destructive: false,
      });
    } else {
      toast.error(err instanceof Error ? err.message : "Falha ao remover volume");
    }
  }
}
</script>

<template>
  <div class="flex items-center justify-end gap-1">
    <Icon v-if="pending" icon="lucide:loader-2" class="h-4 w-4 animate-spin text-slate-400" />
    <button
      v-else
      type="button"
      class="flex items-center gap-1 rounded-app-sm px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent dark:text-red-400 dark:hover:bg-red-950"
      :disabled="disabled"
      :title="
        volume.isSelf
          ? 'Não é possível remover um volume usado pelo próprio container do DockerLocal'
          : inUse
            ? `Em uso por ${volume.usedBy.join(', ')} — remova o container antes`
            : 'Apaga os dados do volume permanentemente'
      "
      @click="handleRemove"
    >
      <Icon icon="lucide:trash-2" class="h-3.5 w-3.5" />
      Remover
    </button>
  </div>
</template>
