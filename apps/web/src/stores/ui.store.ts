import { ref } from "vue";
import { defineStore } from "pinia";

export const useUiStore = defineStore("ui", () => {
  const dockerConnected = ref<boolean | null>(null);
  const engineVersion = ref<string | null>(null);

  return { dockerConnected, engineVersion };
});
