import { ref } from "vue";
import { defineStore } from "pinia";

export const useUiStore = defineStore("ui", () => {
  const engineVersion = ref<string | null>(null);
  const mobileNavOpen = ref(false);

  function toggleMobileNav(): void {
    mobileNavOpen.value = !mobileNavOpen.value;
  }

  function closeMobileNav(): void {
    mobileNavOpen.value = false;
  }

  return { engineVersion, mobileNavOpen, toggleMobileNav, closeMobileNav };
});
