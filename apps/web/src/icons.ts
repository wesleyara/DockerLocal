import { addCollection } from "@iconify/vue";
import lucideIcons from "@iconify-json/lucide/icons.json";

// addCollection empacota o JSON do lucide no bundle — <Icon icon="lucide:x" />
// nunca faz requisição de rede, mesmo com o daemon Docker do usuário offline.
addCollection(lucideIcons);
