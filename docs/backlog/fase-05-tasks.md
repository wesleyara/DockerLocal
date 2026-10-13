# Fase 05 — TaskRegistry

## Objetivo

Infra de jobs longos: iniciar uma operação demorada, ver a saída ao vivo, dar F5 e continuar vendo do ponto certo.

Validada no caso mais simples — `docker pull`. Compose (fase 7) e build (fase 8) apenas reutilizam.

**Esta fase vem antes de 7 e 8 de propósito.** Construir compose e build sem essa infra obriga a reescrever os dois (ADR-05).

> Skills: `nest-sse` (seção "Replay com Last-Event-ID"), `dockerode-streams` (seção 4)

## Tarefas

### Backend

- [x] `Task` em `packages/shared`: `{ id, kind, label, status: 'running'|'succeeded'|'failed'|'cancelled', startedAt, endedAt?, exitCode?, meta }`
- [x] `TaskRegistryService` — `create(kind, label)`, `emit(id, line)`, `succeed`, `fail`, `cancel`, `get`, `list({active})`
- [x] Numeração de linhas com `seq` incremental por task
- [x] Ring buffer de 5.000 linhas por task (um `build --no-cache` de monorepo gera dezenas de milhares)
- [x] `AbortController` por task, para cancelamento cooperativo
- [x] Descarte de tasks finalizadas após ~1 h, com cap total
- [x] `GET /api/tasks?active=true` e `GET /api/tasks/:id`
- [x] `GET /api/tasks/:id/stream` com `@Sse` — lê `Last-Event-ID`, faz replay do buffer a partir de `seq+1`, depois segue ao vivo; `id` do MessageEvent = `seq`
- [x] `POST /api/tasks/:id/cancel` e `DELETE /api/tasks/:id` (só se finalizada)
- [x] `POST /api/images/pull` — `{ ref }` → `202 {taskId}`, usando `docker.pull()` + `followProgress`
- [x] **Checar `errorDetail`**: pull e build falham com HTTP 200; o erro vem como evento no meio do fluxo

### Frontend

- [x] `tasks.store.ts` — tasks ativas + task selecionada no drawer
- [x] Stream de task reaproveitando `api/sse.ts` — inline em `tasks.store.ts` (`watchTask`) em vez de um composable `useTaskStream.ts` separado; único consumidor, sem duplicação a justificar a extração
- [x] Lógica de scroll-automático + virtualização compartilhada entre `LogViewer` e `TaskOutput` extraída para `composables/useAutoScrollVirtualizer.ts` (mesmo efeito do `StreamViewer.vue` planejado — DRY sem forçar um componente genérico com slot)
- [x] `TaskDrawer.vue` — saída ao vivo, status, botão de cancelar
- [x] `TaskIndicator.vue` na `StatusBar` — contador de tasks ativas, abre o drawer
- [x] Diálogo de pull: input do `ref`, dispara e abre o drawer
- [x] Task falha → toast com o erro; sucesso → refetch da lista de imagens

## Critério de aceite

```bash
# 1. Iniciar e acompanhar
curl -s -X POST localhost:5100/api/images/pull \
  -H 'Content-Type: application/json' -H 'X-DockerLocal: 1' \
  -d '{"ref":"alpine:3.19"}'
# {"taskId":"..."}

curl -N localhost:5100/api/tasks/<taskId>/stream

# 2. Replay — deve retomar da linha 11, não do começo
curl -N -H 'Last-Event-ID: 10' localhost:5100/api/tasks/<taskId>/stream
```

- [x] Pull de uma imagem grande pela UI mostra o progresso ao vivo no drawer — testado com `ubuntu:24.04`
- [x] **F5 no meio do pull:** a saída volta completa e continua ao vivo — o pull não foi interrompido — testado: reload no meio do pull, `TaskIndicator` reapareceu sozinho (`restoreActive()`), drawer reaberto mostrou a saída completa desde a primeira linha
- [x] Cancelar uma task em andamento funciona e o status vira `cancelled` — testado com `debian:bookworm`, cancelado no meio do download; `docker images` confirma que a imagem não ficou no host
- [x] `POST /api/images/pull` com `{"ref":"naoexiste/naoexiste:v1"}` → task **`failed`** com mensagem legível (não "succeeded") — testado pela UI, mensagem do registry (404) exibida
- [x] `TaskIndicator` mostra o contador correto e some ao terminar
- [x] Ao final do pull, a lista de imagens se atualiza — testado com `hello-world:latest`, apareceu na tabela sem F5

## Arquivos previstos

```
apps/api/src/tasks/{tasks.module.ts,tasks.controller.ts,task-registry.service.ts}
apps/api/src/images/image-pull.service.ts
packages/shared/src/task.types.ts
apps/web/src/api/tasks.api.ts
apps/web/src/stores/tasks.store.ts        (stream SSE inline via watchTask(), sem composable separado)
apps/web/src/components/tasks/{TaskDrawer.vue,TaskOutput.vue}
apps/web/src/components/layout/TaskIndicator.vue
apps/web/src/composables/useAutoScrollVirtualizer.ts   (scroll+virtualização compartilhada com LogViewer)
```

## Por que Task, e não request síncrona

Um `compose up` de 3 minutos numa request síncrona morre no primeiro refresh, e o usuário fica sem saber se rodou, se falhou, ou se ainda está em pé. Com Task, a operação sobrevive ao browser e a saída pode ser reaberta depois.

O `Last-Event-ID` é o que torna isso barato: o browser já reenvia o header sozinho no reconnect, e o servidor só precisa saber de onde retomar. Foi a principal razão de escolher SSE em vez de WebSocket (ADR-04).

## Armadilha

**`followProgress` reporta sucesso em operação falha.** O HTTP responde 200 e o erro chega como evento com `errorDetail` no meio do fluxo. Sem checar, uma task falha aparece como `succeeded` — e o bug só é notado quando a imagem não está lá. Ver `dockerode-streams`, seção 4.
