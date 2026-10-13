import { createApp } from "vue";
import { createPinia } from "pinia";
// Fontes empacotadas via @fontsource — zero requisição de rede em runtime,
// mesmo princípio do addCollection() dos ícones (ver icons.ts).
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./style.css";
import "./icons";
import App from "./App.vue";
import router from "./router";

createApp(App).use(createPinia()).use(router).mount("#app");
