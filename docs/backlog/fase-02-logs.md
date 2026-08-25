# Fase 02 — Logs em tempo real

## Objetivo

Clicar num container e ver o log correndo ao vivo, com filtro, pausa e scroll fluido mesmo com dezenas de milhares de linhas.

**É a fase mais densa e a de maior valor percebido.** Também é onde ficam as três armadilhas mais caras do projeto.

> Skills: `dockerode-streams` (seções 1–3), `nest-sse`, `vue-resource-ui` (seções 3 e 4)

## Tarefas

### Backend — a parte delicada

- [x] `common/utils/line-splitter.ts` — Transform que guarda a linha parcial entre chunks e **emite o resto no `_flush`** (senão a última linha some)
- [x] `common/utils/ring-buffer.ts` com cap configurável
- [x] `LogSessionService.openStream()` — **inspecionar `Config.Tty` e ramificar**: com TTY sem demux, sem TTY com `modem.demuxStream`
- [x] `setEncoding('utf8')` antes de qualquer split (acentos quebram se o chunk cortar no meio de um multibyte)
- [x] Refcount por container — dois browsers no mesmo container = 1 stream no daemon
- [x] Grace period de 30 s antes de destruir a sessão, para que um F5 não derrube o stream
- [x] Cap global de ~20 sessões
- [x] Ring buffer de 5.000 linhas por sessão, para replay imediato ao abrir
- [x] Batching com `bufferTime(100)` + contador `dropped`
- [x] `GET /api/containers/:id/logs` — snapshot sem follow
- [x] `GET /api/containers/:id/logs/stream` com `@Sse` — headers anti-buffering, heartbeat de 20 s, **`finalize()` liberando a sessão**
- [x] `event: log-end` com `reason: 'container-stopped'|'removed'|'error'`
- [x] Expor `activeLogSessions` em `/api/system/info`
- [x] Confirmar que `compression` **não** está registrado no Express

### Frontend

- [x] `api/sse.ts` — `createSseClient` com reconnect e `Last-Event-ID`
- [x] `useLogStream.ts` — buffer não reativo + commit por `requestAnimationFrame`
- [x] `LogViewer.vue` com `@tanstack/vue-virtual`, altura fixa quando `wrap = off`
- [x] Pin to bottom: autoscroll até o usuário rolar acima; botão "↓ novas linhas"
- [x] `LogToolbar.vue` — filtro de texto, toggle stdout/stderr, timestamps, wrap, pausa, limpar, baixar `.log`, `tail` inicial (100/500/2000)
- [x] Fechar o `EventSource` ao receber `log-end` (senão reconecta em loop contra 404) e no `onUnmounted`
- [x] Strip de escapes ANSI
- [x] `ContainerLogsView.vue` (rota `/containers/:id/logs`)

## Critério de aceite

```bash
# 1. Demux correto — nenhum byte de controle no meio do texto
curl -N localhost:5100/api/containers/<id-invest-broker-api>/logs/stream | head -20

# 2. Comparar com a fonte da verdade
docker logs --tail 50 invest-broker-api
```

- Log de `invest-broker-api` corre ao vivo e bate com `docker logs -f`
- **stderr vem marcado** e é exibido em cor distinta
- **Teste de TTY:** `docker run -dt --name tty-test alpine sh -c 'while true; do date; sleep 1; done'` → o log aparece limpo, sem lixo no início das linhas. Remover depois.
- **Teste de vazamento:** abrir e fechar o log 20×, esperar 40 s, então `curl -s localhost:5100/api/system/info | jq .activeLogSessions` → **0**
- Rolar para cima congela o autoscroll; o botão "↓ novas linhas" aparece e funciona
- Com 10.000+ linhas no buffer, o scroll continua fluido
- Remover o container com o log aberto → chega `log-end`, o stream fecha e **não** entra em loop de reconnect
- Pausar interrompe a atualização visual **sem** fechar o SSE

## Arquivos previstos

```
apps/api/src/common/utils/{line-splitter.ts,ring-buffer.ts}
apps/api/src/containers/{logs.controller.ts,log-session.service.ts}
apps/api/src/containers/dto/log-query.dto.ts
packages/shared/src/log.types.ts
apps/web/src/api/sse.ts
apps/web/src/composables/useLogStream.ts
apps/web/src/components/logs/{LogViewer.vue,LogToolbar.vue,LogLine.vue}
apps/web/src/views/ContainerLogsView.vue
```

## As três armadilhas desta fase

**1. TTY vs demux.** Aplicar `demuxStream` num container com TTY corrompe a saída (os 8 primeiros bytes de texto viram header). Não aplicar num sem TTY enche a tela de bytes de controle. Só o `inspect().Config.Tty` decide — e os dois caminhos precisam de teste.

**2. Streams que vazam.** Cada log aberto é uma conexão HTTP viva no daemon. Sem refcount e `finalize()`, o app acumula FDs e o dockerd acumula goroutines; o sintoma é CPU subindo devagar ao longo de horas, quase impossível de diagnosticar depois. Daí `activeLogSessions` ser exposto: vazamento que não é observável não é corrigido.

**3. `compression` do Express mata SSE.** Bufferiza e os logs chegam em blocos de 16 KB. Se registrar por qualquer motivo, filtre `text/event-stream`.

## Nota de projeto

`LogViewer` e o `TaskOutput` da fase 5 são o mesmo problema. Extraia como `<StreamViewer>` com props de fonte — não duplique a virtualização.

## Extensão pós-fase: stream agregado de grupo

Adicionado depois do critério de aceite original, para dar suporte a "ver logs do projeto inteiro" sem furar o teto de 3 SSE por aba: `GET /containers/logs/stream?ids=a,b,c` no `LogsController`, um único `@Sse` que faz `subscribe()` em cada container e faz `merge()` dos `lines$`/`end$` de cada sessão, marcando cada linha com `containerId`. `log-end` de um container não fecha a conexão dos demais (`closeOnEnd: false` no `useLogStream`) — só marca aquele container como encerrado.

**Bug real encontrado e corrigido no processo:** o replay dependia de ler `session.buffer` logo após abrir o stream `follow:true, tail:500`; como o Docker entrega esse histórico embutido de forma assíncrona (via `data` events do stream), a primeira leitura do buffer sempre vinha vazia, e as até-500 linhas históricas apareciam alguns milissegundos depois como se fossem "ao vivo" — ignorando o `tail` pedido pelo cliente. `open()` agora busca o histórico com uma chamada síncrona sem `follow` (`fetchHistory`, reaproveitada por `snapshot()`) para seedar o ring buffer *antes* de abrir o stream de acompanhamento com `tail: 0`.
