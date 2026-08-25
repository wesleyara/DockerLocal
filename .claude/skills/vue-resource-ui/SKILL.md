---
name: vue-resource-ui
description: Padrões de UI de recursos no Vue 3 — resource store com Pinia, híbrido push/polling, e o viewer de log virtualizado que não trava com 10 mil linhas. Use ao criar ou mexer em stores, views de recurso (Containers/Images/Volumes/Stacks), LogViewer ou TaskOutput.
---

# UI de recursos no Vue

## 1. Resource store

Mesmo formato para containers, images, volumes e stacks:

```ts
export const useContainersStore = defineStore('containers', () => {
  const items = shallowRef<ContainerSummary[]>([]);   // lista grande, troca inteira
  const loading = ref(false);
  const error = ref<string | null>(null);
  const pending = reactive(new Set<string>());        // ids em transição

  async function fetch(force = false) { /* dedup de chamadas concorrentes */ }

  async function act(id: string, action: 'start'|'stop'|'restart'|'remove', opts?) {
    pending.add(id);
    try { await api[action](id, opts); await fetch(true); }
    finally { pending.delete(id); }
  }

  const byProject = computed(() => groupBy(items.value, c => c.compose?.project ?? ''));
  return { items, loading, error, pending, fetch, act, byProject };
});
```

**`shallowRef` para a lista.** Reatividade profunda em array de centenas de objetos é desperdício — a lista é sempre substituída inteira, nunca mutada campo a campo.

**`pending` é o que faz a UI parecer rápida** sem optimistic update mentiroso: o botão vira spinner, a linha fica fosca, e o estado real chega do refetch. Não finja que o container parou antes de o daemon confirmar.

## 2. Push e polling — os dois, com papéis distintos

**Push (primário):** um SSE em `/api/system/events/stream`. Ao chegar evento, refetch **debounced (300 ms)** do recurso afetado.

**Não aplique delta a partir do evento.** `docker events` não traz `Status`, nem portas, nem uptime — você acabaria com linhas pela metade. O evento é **invalidação de cache**, não fonte de dados.

**Polling (rede de segurança):** 10 s, suspenso enquanto o SSE está saudável, agressivo (3 s) se cair.

```ts
// useResourcePolling.ts
useDocumentVisibility();   // pare tudo com visibilityState === 'hidden'
```

Sem a pausa por visibilidade, o app come CPU em aba de fundo o dia inteiro. E nunca faça poll de 1 s: `listContainers` + `listVolumes` + cruzamento de `usedBy` a cada segundo aparece no `top`.

Após ação do usuário, **refetch imediato** — não espere o evento chegar.

Quando o SSE cai, reflita na `StatusBar` ("desconectado do Docker"). O usuário precisa saber que a tela congelou, senão confia em dado velho.

## 3. LogViewer — onde o front trava se for ingênuo

Este componente é o mais delicado do frontend. Cinco requisitos, todos necessários:

**Buffer em `shallowRef<LogLine[]>`**, cap de 10.000 linhas com drop do início. Array de 10 mil objetos com reatividade profunda trava garantido. `shallowRef` + substituição do array inteiro (ou `markRaw` nas linhas) resolve.

**Commit por `requestAnimationFrame`.** O SSE já chega em lotes de 100 ms; acumule num array **não reativo** e faça um único commit por frame. Um commit por lote recebido ainda é rápido demais para o Vue acompanhar.

**Virtual scroll com `@tanstack/vue-virtual`.** Com `wrap = off` (default), altura de linha fixa → estimativa exata e scroll fluido com 10 mil linhas. Com `wrap = on` é preciso `measureElement`, bem mais caro — deixe como toggle e avise que é mais lento.

**Pin to bottom.** Autoscroll ativo até o usuário rolar para cima:

```ts
const atBottom = () => el.scrollTop + el.clientHeight >= el.scrollHeight - 8;
```

Quando sai do fundo, mostre botão flutuante "↓ novas linhas".

**Toolbar:** filtro por texto (client-side, com destaque), toggle stdout/stderr, timestamps on/off, wrap on/off, pausar (para de aplicar o buffer, **não** fecha o SSE), limpar, baixar `.log` (Blob do buffer), seletor de `tail` inicial (100/500/2000).

### ANSI

Para o MVP, `--ansi never` no compose e strip simples de escapes nos logs de container já basta. Se decidir manter cores, use `anser`/`ansi_up` convertendo para spans — **sempre escapando HTML antes**.

### Reúso

O mesmo componente serve `LogViewer` e `TaskOutput` (build/compose). Extraia como `<StreamViewer>` com props de fonte — não duplique a virtualização.

## 4. Fechar o EventSource na hora certa

`EventSource` reconecta sozinho, inclusive contra um container que não existe mais. Ao receber `log-end`:

```ts
es.addEventListener('log-end', (e) => {
  const { reason } = JSON.parse(e.data);
  es.close();                                   // impede loop de reconnect
  if (reason === 'container-stopped') showReconnectButton();
});
```

E sempre `es.close()` no `onUnmounted` do componente.

## 5. FileBrowserDialog

Props `{ mode: 'compose' | 'dockerfile' | 'dir' }`, emite o path escolhido.

Seletor de raiz no topo, breadcrumb navegável, diretórios primeiro, ícone especial para `docker-compose.yml` e `Dockerfile`, botão "usar este arquivo" habilitado só quando o tipo casa com o `mode`.

Ao entrar num diretório, chame `/api/fs/detect` e **destaque as sugestões** — economiza 90% dos cliques.

`parent: null` significa raiz: não deixe navegar acima.

## 6. Confirmação por digitação

Para `down -v`, `prune` e remoção de volume, exija digitar o nome do recurso. É defesa de UX, mas é a que mais evita acidente real — essas três operações destroem dado sem volta.

## 7. Cliente HTTP

`api/http.ts` centraliza: baseURL, header `X-DockerLocal: 1` em métodos não-GET (exigido pelo `OriginGuard`), e unwrap do formato de erro do Nest. Erro 409 vem com `canForce: true` — o front oferece "forçar" em vez de só mostrar a mensagem.
