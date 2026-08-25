# Fase 05 — TaskRegistry

## Objetivo

Infra de jobs longos: iniciar uma operação demorada, ver a saída ao vivo, dar F5 e continuar vendo do ponto certo.

Validada no caso mais simples — `docker pull`. Compose (fase 7) e build (fase 8) apenas reutilizam.

**Esta fase vem antes de 7 e 8 de propósito.** Construir compose e build sem essa infra obriga a reescrever os dois (ADR-05).

> Skills: `nest-sse` (seção "Replay com Last-Event-ID"), `dockerode-streams` (seção 4)

## Tarefas

### Backend

- [ ] `Task` em `packages/shared`: `{ id, kind, label, status: 'running'|'succeeded'|'failed'|'cancelled', startedAt, endedAt?, exitCode?, meta }`
- [ ] `TaskRegistryService` — `create(kind, label)`, `emit(id, line)`, `succeed`, `fail`, `cancel`, `get`, `list({active})`
- [ ] Numeração de linhas com `seq` incremental por task
- [ ] Ring buffer de 5.000 linhas por task (um `build --no-cache` de monorepo gera dezenas de milhares)
- [ ] `AbortController` por task, para cancelamento cooperativo
- [ ] Descarte de tasks finalizadas após ~1 h, com cap total
- [ ] `GET /api/tasks?active=true` e `GET /api/tasks/:id`
- [ ] `GET /api/tasks/:id/stream` com `@Sse` — lê `Last-Event-ID`, faz replay do buffer a partir de `seq+1`, depois segue ao vivo; `id` do MessageEvent = `seq`
- [ ] `POST /api/tasks/:id/cancel` e `DELETE /api/tasks/:id` (só se finalizada)
- [ ] `POST /api/images/pull` — `{ ref }` → `202 {taskId}`, usando `docker.pull()` + `followProgress`
- [ ] **Checar `errorDetail`**: pull e build falham com HTTP 200; o erro vem como evento no meio do fluxo

### Frontend

- [ ] `tasks.store.ts` — tasks ativas + task selecionada no drawer
- [ ] `useTaskStream.ts` reaproveitando `api/sse.ts`
- [ ] Extrair `StreamViewer.vue` do `LogViewer` (props de fonte) e usar nos dois
- [ ] `TaskDrawer.vue` — saída ao vivo, status, botão de cancelar
- [ ] `TaskIndicator.vue` na `StatusBar` — contador de tasks ativas, abre o drawer
- [ ] Diálogo de pull: input do `ref`, dispara e abre o drawer
- [ ] Task falha → toast com o erro; sucesso → refetch da lista de imagens

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

- Pull de uma imagem grande pela UI mostra o progresso ao vivo no drawer
- **F5 no meio do pull:** a saída volta completa e continua ao vivo — o pull não foi interrompido
- Cancelar uma task em andamento funciona e o status vira `cancelled`
- `POST /api/images/pull` com `{"ref":"naoexiste/naoexiste:v1"}` → task **`failed`** com mensagem legível (não "succeeded")
- `TaskIndicator` mostra o contador correto e some ao terminar
- Ao final do pull, a lista de imagens se atualiza

## Arquivos previstos

```
apps/api/src/tasks/{tasks.module.ts,tasks.controller.ts,task-registry.service.ts}
apps/api/src/images/image-pull.service.ts
packages/shared/src/task.types.ts
apps/web/src/api/tasks.api.ts
apps/web/src/stores/tasks.store.ts
apps/web/src/composables/useTaskStream.ts
apps/web/src/components/tasks/{TaskDrawer.vue,TaskOutput.vue}
apps/web/src/components/layout/TaskIndicator.vue
apps/web/src/components/logs/StreamViewer.vue   (extraído de LogViewer)
```

## Por que Task, e não request síncrona

Um `compose up` de 3 minutos numa request síncrona morre no primeiro refresh, e o usuário fica sem saber se rodou, se falhou, ou se ainda está em pé. Com Task, a operação sobrevive ao browser e a saída pode ser reaberta depois.

O `Last-Event-ID` é o que torna isso barato: o browser já reenvia o header sozinho no reconnect, e o servidor só precisa saber de onde retomar. Foi a principal razão de escolher SSE em vez de WebSocket (ADR-04).

## Armadilha

**`followProgress` reporta sucesso em operação falha.** O HTTP responde 200 e o erro chega como evento com `errorDetail` no meio do fluxo. Sem checar, uma task falha aparece como `succeeded` — e o bug só é notado quando a imagem não está lá. Ver `dockerode-streams`, seção 4.
