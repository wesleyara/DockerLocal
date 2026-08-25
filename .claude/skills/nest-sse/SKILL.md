---
name: nest-sse
description: Server-Sent Events no NestJS — @Sse com Observable, heartbeat, headers anti-buffering, replay por Last-Event-ID e as armadilhas de middleware que matam o stream. Use ao criar ou depurar qualquer endpoint /stream (logs, eventos do daemon, saída de task, stats).
---

# SSE no NestJS

Todo streaming deste projeto é SSE. O fluxo é unidirecional, `EventSource` traz reconnect e `Last-Event-ID` de graça, e dá para depurar com `curl -N`. Ver ADR-04 em `docs/decisoes.md`.

## Forma básica

```ts
@Sse(':id/logs/stream')
stream(@Param('id') id: string, @Query() q: LogQueryDto,
       @Res({ passthrough: true }) res: Response) {
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Cache-Control', 'no-cache, no-transform');

  const { replay, stream$ } = this.sessions.subscribe(id, q);

  return concat(of(replay), stream$).pipe(
    map(lines => ({ type: 'logs', data: { lines } } as MessageEvent)),
    merge(interval(20_000).pipe(map(() => ({ type: 'ping', data: {} } as MessageEvent)))),
    finalize(() => this.sessions.release(id)),
  );
}
```

`type` vira o `event:` do SSE (o cliente escuta com `addEventListener('logs', ...)`); `data` é serializado como JSON. `id` no `MessageEvent` vira o `id:` — é o que o browser reenvia como `Last-Event-ID`.

## As quatro armadilhas

**1. `compression` do Express mata SSE.** Ele bufferiza e o log só aparece em blocos de 16 KB. Não registre o middleware, ou dê um `filter` que ignore `text/event-stream`. Sintoma: logs chegam em rajadas com segundos de atraso.

**2. Sem heartbeat, a conexão morre em ~60 s.** Proxies e alguns ambientes cortam conexão ociosa. Mande `event: ping` a cada 20 s. Junto com isso, `X-Accel-Buffering: no` e `Cache-Control: no-cache, no-transform`.

**3. `finalize()` não é opcional.** O Nest cancela a subscription quando a request fecha, mas depender disso implicitamente é frágil — e é exatamente onde streams vazam. Libere o recurso explicitamente.

**4. `EventSource` reconecta sozinho, inclusive quando não deveria.** Container removido → o stream fecha → o browser reabre em loop contra um 404. Emita `event: log-end` com motivo e **feche do lado do cliente**:

```ts
es.addEventListener('log-end', (e) => {
  const { reason } = JSON.parse(e.data);
  es.close();                                   // impede o loop de reconnect
  if (reason === 'container-stopped') showReconnectButton();
});
```

## Replay com `Last-Event-ID`

É a razão de usar SSE em vez de WebSocket nas Tasks. Numere as linhas com `seq`, use como `id`, e no reconnect retome do ponto:

```ts
@Sse(':id/stream')
taskStream(@Param('id') id: string, @Headers('last-event-id') lastId?: string) {
  const from = lastId ? Number(lastId) + 1 : 0;
  const task = this.registry.get(id);
  return concat(
    from(task.buffer.since(from)),      // replay
    task.lines$,                        // ao vivo
  ).pipe(map(l => ({ id: String(l.seq), type: 'line', data: l } as MessageEvent)));
}
```

Um `compose up` de 3 minutos sobrevive a um F5 sem perder saída.

## Orçamento de conexões

HTTP/1.1 limita **6 conexões por origem**. O design fica em **no máximo 3 SSE por aba**:

1. eventos do daemon (sempre aberto)
2. logs (só com o viewer aberto)
3. task (só com o drawer aberto)

Logs de múltiplos containers são **agregados no servidor** — um único SSE com campo `service` por linha, nunca N conexões. Se algum dia precisar de N viewers lado a lado, a saída é a mesma: multiplexar no backend com `?containers=a,b,c`.

Deixe isso comentado no código; é o tipo de limite que alguém fura sem perceber.

## Batching

Um container verboso mata o `EventSource` se você emitir um evento por linha:

```ts
subject.pipe(bufferTime(100), filter(a => a.length > 0))
```

Com cap de linhas por lote e contador `dropped`, a UI mostra "… 12.430 linhas descartadas" em vez de travar.

## Autenticação

`EventSource` **não aceita headers customizados**. Se `AUTH_TOKEN` for ativado, os endpoints SSE autenticam por cookie `HttpOnly; SameSite=Strict` (setado por `POST /api/auth/login`). `?token=` funciona mas vaza em logs de acesso — prefira o cookie.

## Dev proxy

`vite.config.ts` com `server.proxy['/api'] = { target: 'http://127.0.0.1:5100', changeOrigin: false }`. O proxy do Vite repassa SSE corretamente; se aparecer buffering, aponte o `EventSource` direto para `http://127.0.0.1:5100` e libere `http://localhost:5173` no CORS e no `OriginGuard`.

## Depurando

```bash
curl -N localhost:5100/api/containers/<id>/logs/stream
curl -N localhost:5100/api/system/events/stream
curl -N -H 'Last-Event-ID: 42' localhost:5100/api/tasks/<id>/stream
```

Se `curl -N` mostra os eventos fluindo mas o browser não, o problema é proxy/buffering ou o cliente — não o servidor.
