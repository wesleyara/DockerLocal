---
name: dockerode-streams
description: Padrões e armadilhas ao consumir streams do dockerode — logs de container (demux vs TTY), progresso de build/pull com followProgress, refcount de sessões e teardown. Use ao mexer em log-session.service.ts, docker-events.service.ts, image-build.service.ts ou qualquer código que abra stream no daemon.
---

# Streams do dockerode

Quatro armadilhas nesta área custam horas cada. Todas são silenciosas: o código roda, e o bug aparece na tela ou só depois de horas de uptime.

## 1. Demux vs TTY — sempre inspecione antes

Sem TTY, `GET /containers/:id/logs` retorna um stream **multiplexado**: cada frame é `[stream_type:1B][0,0,0][size:uint32 BE]` + payload (`1`=stdout, `2`=stderr). Mandar isso direto pro browser enche a tela de bytes de lixo.

Com TTY (`Config.Tty === true`), o stream é **cru**. Aplicar demux aí **corrompe a saída** — os 8 primeiros bytes de texto viram header.

Não dá para adivinhar: inspecione.

```ts
const container = this.docker.getContainer(id);
const info = await container.inspect();
const hasTty = info.Config.Tty === true;

// @types/dockerode não distingue: com follow:true vem Readable, sem vem Buffer.
const raw = (await container.logs({
  follow: true, stdout: opts.stdout, stderr: opts.stderr,
  tail: opts.tail ?? 500, timestamps: true, since: opts.since,
})) as unknown as NodeJS.ReadableStream;

if (hasTty) {
  this.pipeChannel(raw, 'stdout');              // SEM demux
} else {
  const out = new PassThrough(), err = new PassThrough();
  container.modem.demuxStream(raw, out, err);   // resolve o header de 8 bytes
  this.pipeChannel(out, 'stdout');
  this.pipeChannel(err, 'stderr');
}
return raw;   // guarde para .destroy() no teardown
```

Teste os dois caminhos. `invest-broker-api` não tem TTY; suba algo com `-t` para o outro.

## 2. `setEncoding('utf8')` antes de qualquer split

`demuxStream` **não faz line buffering** — um frame pode conter meia linha. E fazer split em `Buffer` para depois chamar `toString()` quebra acentos quando o chunk corta no meio de um caractere multibyte.

```ts
private pipeChannel(s: NodeJS.ReadableStream, chan: 'stdout' | 'stderr') {
  s.setEncoding('utf8');        // StringDecoder interno: nunca corta UTF-8 no meio
  s.pipe(new LineSplitter())    // Transform que guarda a linha parcial entre chunks
   .on('data', (line: string) => this.push(chan, line));
}
```

`LineSplitter` precisa emitir o resto pendente no `_flush`, senão a última linha some.

## 3. Refcount, grace period e teardown

Cada `logs({follow:true})` e cada `getEvents()` é uma conexão HTTP viva no daemon. Teardown faltando = FDs acumulando e goroutines no dockerd. O sintoma é CPU subindo lentamente ao longo de horas — quase impossível de diagnosticar depois.

```ts
interface LogSession {
  containerId: string;
  raw: NodeJS.ReadableStream;
  subject: Subject<LogLine>;
  buffer: RingBuffer<LogLine>;    // últimas 5000 linhas
  refs: number;
  closeTimer?: NodeJS.Timeout;
}
```

- **Refcount** — dois browsers no mesmo container = 1 stream no daemon. Sem isso, cada F5 abre conexão nova e as velhas só morrem quando o TCP colapsa.
- **Grace period de 30 s** antes de destruir, para que um refresh não derrube e reabra o stream.
- **Cap global** (~20 sessões) para não vazar FDs.
- **Batching** — `subject.pipe(bufferTime(100), filter(a => a.length > 0))`. Um container que cospe 50 mil linhas/s mata o `EventSource` se você emitir evento por linha. Conte o que descartar e mande em `dropped`.
- Exponha `activeLogSessions` em `/api/system/info` — vazamento que não é observável não é corrigido.

No controller, `finalize()` é a linha que impede o vazamento. O Nest cancela a subscription quando a request fecha, mas depender disso implicitamente é frágil:

```ts
return concat(of(replay), stream$).pipe(
  map(lines => ({ type: 'logs', data: { lines } } as MessageEvent)),
  finalize(() => this.sessions.release(id)),   // obrigatório
);
```

## 4. `followProgress` — build falho retorna HTTP 200

Esta é a que mais engana: o build quebra e o HTTP responde 200. O erro chega como **evento com `errorDetail` no meio do fluxo**. Quem não checa reporta sucesso em build quebrado.

```ts
this.docker.modem.followProgress(
  stream,
  (err, output) => {
    const failure = output?.find((o: any) => o.errorDetail || o.error);
    if (err || failure) return task.fail(failure?.error ?? err.message);
    const aux = [...output].reverse().find((o: any) => o.aux?.ID);
    task.succeed({ imageId: aux?.aux?.ID });
  },
  (ev: any) => {
    if (ev.stream) emit({ s: 'stdout', text: ev.stream.replace(/\n$/, '') });
    if (ev.status) emit({ s: 'stdout', text: `${ev.id ?? ''} ${ev.status} ${ev.progress ?? ''}`.trim() });
    if (ev.errorDetail) emit({ s: 'stderr', text: ev.errorDetail.message });
  },
);
```

`followProgress` acumula **todos** os eventos em memória para o `onFinished`. Em build grande isso pesa — o ring buffer da Task é quem limita o que chega na UI.

O mesmo handler serve para `docker.pull()`.

## 5. `getEvents()` morre com o daemon

Um restart do Docker derruba o stream permanentemente se não houver reconnect. Faça retry com backoff (1s → 30s) e **reflita o estado na UI** — o usuário precisa saber que a tela congelou, senão confia em dados velhos.

Mantenha **um único** stream de eventos compartilhado no `DockerEventsService`, nunca um por request.

## 6. Contexto de build com `tar-fs` (caminho fallback)

Só relevante no `engine: 'api'`. O padrão é `docker build` via CLI (ver skill `compose-cli`).

```ts
return tarFs.pack(contextPath, {
  // tar-fs entrega path ABSOLUTO aqui — relativize e normalize separadores
  // antes de perguntar ao .dockerignore.
  ignore: (name) => {
    const rel = path.relative(contextPath, name).split(path.sep).join('/');
    return rel !== '' && ig.ignores(rel);
  },
  dereference: false,
});
```

- `dockerfile` na opção do `buildImage` é **relativo à raiz do contexto**, com `/`. Caminho absoluto dá `Cannot locate specified Dockerfile`.
- Dockerfile fora do contexto → `path.relative` começa com `..` → rejeite com 400 e mensagem explícita.
- Contexto grande sem `.dockerignore` (`node_modules`) trava por minutos. Conte arquivos antes e avise acima de ~20 mil.

## 7. Erros: 404 e 409

`DockerExceptionFilter` traduz o erro do dockerode (que tem `statusCode` e mensagem longa e feia):

- **404** → "não encontrado (já foi removido?)"
- **409** → mensagem humana + `canForce: true`, e o front oferece "Remover mesmo assim"

Cuidado: `force` numa imagem usada por container parado remove a imagem e deixa o container órfão. Avise antes.

## 8. Não vaze tipos do dockerode

`@types/dockerode` (4.0.1) não cobre tudo da API 1.55 e mente em pontos importantes. Trate dockerode como fonte **não tipada** na fronteira do service e normalize para os tipos de `packages/shared`. `Dockerode.ContainerInfo` nunca chega ao frontend.
