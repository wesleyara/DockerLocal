<script setup lang="ts">
import { computed } from "vue";
import type { ImageSummary } from "@dockerlocal/shared";
import { Icon } from "@iconify/vue";
import { useImagesStore } from "@/stores/images.store";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import { ApiError } from "@/api/http";

const props = defineProps<{
  image: ImageSummary;
  pending: boolean;
}>();

const store = useImagesStore();
const { confirm } = useConfirm();
const toast = useToast();

const inUse = computed(() => props.image.usedBy.length > 0);
const label = computed(() => props.image.repoTags[0] ?? props.image.shortId);

async function handleRemove(): Promise<void> {
  const ok = await confirm({
    title: "Remover imagem",
    message: `Remover "${label.value}"? Essa ação não pode ser desfeita.`,
    confirmLabel: "Remover",
  });
  if (!ok) return;

  try {
    await store.remove(props.image.id);
    toast.success(`Imagem "${label.value}" removida.`);
  } catch (err) {
    if (err instanceof ApiError && err.canForce) {
      // Corrida rara: a imagem passou a estar em uso entre a listagem e o
      // clique. Não oferecemos forçar aqui — o usuário precisa remover o
      // container antes.
      await confirm({
        title: "Imagem em uso",
        message: `${err.message} Remova ou pare o container antes de remover a imagem.`,
        confirmLabel: "Entendi",
        destructive: false,
      });
    } else {
      toast.error(err instanceof Error ? err.message : "Falha ao remover imagem");
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
      :disabled="inUse || image.isSelf"
      :title="
        image.isSelf
          ? 'Não é possível remover a imagem do próprio container do DockerLocal'
          : inUse
            ? `Em uso por ${image.usedBy.join(', ')} — remova o container antes`
            : 'Remover imagem permanentemente'
      "
      @click="handleRemove"
    >
      <Icon icon="lucide:trash-2" class="h-3.5 w-3.5" />
      Remover
    </button>
  </div>
</template>
