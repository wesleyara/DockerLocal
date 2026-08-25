# Fase 03 — Eventos do daemon

## Objetivo

Mexer num container pelo terminal e ver a UI se atualizar sozinha, sem refresh.

Deixa de existir "dado velho na tela": o polling vira rede de segurança em vez de mecanismo principal.

> Skills: `dockerode-streams` (seção 5), `nest-sse`, `vue-resource-ui` (seção 2)

## Tarefas

### Backend

- [x] `DockerEventsService` no `onModuleInit` — **um único** `docker.getEvents()` compartilhado, exposto como `Subject`; nunca um por request
- [x] Reconnect com backoff (1 s → 30 s) — restart do Docker derruba o stream permanentemente sem isso
- [x] Estado de conexão observável (`connected: boolean`) para a UI consumir
- [x] Normalizar o evento: `{ type, action, id, name, project, time }` — extrair `project` das labels do actor
- [x] `GET /api/system/events/stream` com `@Sse`, filtro `?types=container,image,volume,network`
- [x] Heartbeat de 20 s e headers anti-buffering
- [x] `onModuleDestroy` destruindo o stream

### Frontend

- [x] `events.store.ts` — conexão SSE global + estado de conexão
- [x] `useDockerEvents.ts` — mapeia evento → store afetada, com **refetch debounced (300 ms)**
- [x] Ajustar `useResourcePolling`: suspender enquanto o SSE está saudável, cair para 3 s se desconectar
- [x] `StatusBar` mostra "desconectado do Docker" quando o SSE cai
- [x] Reconectar o SSE ao voltar de `visibilityState === 'hidden'`

## Critério de aceite

```bash
curl -N localhost:5100/api/system/events/stream
# em outro terminal:
docker start capp.redis
```

- Com a UI aberta em Containers, `docker start capp.redis` no terminal muda a linha **sem refresh**, em menos de 1 s
- `docker stop capp.redis` idem
- **Teste de reconnect:** `sudo systemctl restart docker` → a StatusBar mostra "desconectado", e ao voltar o stream reconecta sozinho e a lista se atualiza
- Aba em segundo plano não gera requisições (conferir no Network do devtools)
- Uma única conexão de eventos no daemon, mesmo com várias abas do app abertas

## Arquivos previstos

```
apps/api/src/docker/docker-events.service.ts
apps/api/src/system/system-events.controller.ts
packages/shared/src/event.types.ts
apps/web/src/stores/events.store.ts
apps/web/src/composables/useDockerEvents.ts
```

## A decisão que importa aqui

**O evento é invalidação de cache, não fonte de dados.**

`docker events` não traz `Status`, nem portas, nem uptime. Aplicar delta a partir do evento produziria linhas com dados pela metade — um container "running" sem porta nenhuma listada, por exemplo. Ao receber o evento, a store faz **refetch** do recurso afetado; o debounce de 300 ms evita a rajada de N requisições quando um `compose up` sobe seis serviços de uma vez.

O polling continua existindo porque o stream de eventos pode cair silenciosamente. Ele só não é mais o caminho principal.
