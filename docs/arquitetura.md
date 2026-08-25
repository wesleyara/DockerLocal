# Arquitetura

## Visão geral

```
┌─────────────────────────────────────────┐
│  Vue 3 + Pinia          (browser)       │
│  EventSource ──────────────┐            │
└────────┬───────────────────┼────────────┘
         │ REST              │ SSE
┌────────▼───────────────────▼────────────┐
│  NestJS (Express)                       │
│                                         │
│  ┌────────────┐      ┌───────────────┐  │
│  │ dockerode  │      │ child_process │  │
│  │  (socket)  │      │  (docker CLI) │  │
│  └─────┬──────┘      └───────┬───────┘  │
└────────┼─────────────────────┼──────────┘
         │                     │
    /var/run/docker.sock ◄─────┘
         │
   ┌─────▼──────┐
   │  dockerd   │  (no HOST, sempre)
   └────────────┘
```

A linha divisória: **o que a Engine API resolve nativamente vai por dockerode; orquestração vai por CLI.** Compose não existe na Engine API — é uma ferramenta cliente que cria recursos comuns e os marca com labels. BuildKit também não: o `POST /build` do dockerode usa o builder clássico, deprecado no Docker 29.

Consequência prática: `apps/api` precisa do **CLI do docker + plugins compose/buildx** disponíveis no PATH, mesmo rodando em container.

## Backend — `apps/api`

```
src/
├── main.ts                    bind em 127.0.0.1 (ou 0.0.0.0 só dentro de container)
├── app.module.ts
│
├── config/
│   ├── configuration.ts       env tipada
│   └── env.schema.ts          zod: PORT, HOST, DOCKER_SOCKET, FS_ROOTS, AUTH_TOKEN?, ALLOWED_ORIGINS
│
├── common/
│   ├── guards/origin.guard.ts           anti-CSRF / DNS rebinding
│   ├── guards/token.guard.ts            só ativo se AUTH_TOKEN existir
│   ├── filters/docker-exception.filter.ts   traduz 404/409 do dockerode
│   ├── pipes/zod-validation.pipe.ts
│   ├── utils/line-splitter.ts           Transform: chunk → linhas, UTF-8 safe
│   ├── utils/ring-buffer.ts
│   └── utils/mutex.ts                   lock por chave
│
├── docker/                    @Global — dono único do client
│   ├── docker.provider.ts     factory: new Docker({ socketPath })
│   ├── docker.service.ts      ping/version/info/df
│   └── docker-events.service.ts   getEvents() → Subject, com reconnect
│
├── containers/
│   ├── containers.controller.ts / .service.ts
│   ├── logs.controller.ts     @Sse
│   └── log-session.service.ts demux + refcount + ring buffer + fan-out
│
├── images/
│   ├── images.controller.ts / .service.ts
│   ├── image-build-cli.service.ts    spawn `docker build` (padrão)
│   └── image-build.service.ts        dockerode buildImage (fallback)
│
├── volumes/       networks/ (fase 10)
│
├── stacks/
│   ├── stack-discovery.service.ts    agrupa por labels — leitura pura
│   ├── stack-registry.service.ts     ~/.dockerlocal/stacks.json
│   └── compose-cli.service.ts        spawn com streaming + mutex
│
├── filesystem/
│   ├── path-safety.service.ts        realpath + allowlist
│   └── file-detect.service.ts        acha compose/Dockerfile num dir
│
├── tasks/         task-registry.service.ts + tasks.controller.ts (@Sse)
├── system/        info, df, @Sse de eventos do daemon
└── static/        ServeStaticModule (prod)
```

### Os três módulos que sustentam o resto

**`docker`** — `@Global()`, expõe um único `Docker` via token `DOCKER_CLIENT`. Ninguém mais instancia. Mantém também **um único** stream de `getEvents()` compartilhado, nunca um por request.

**`tasks`** — a peça mais importante depois do docker module. Toda operação longa que produz texto vira uma Task com id, ring buffer e Observable. Desacopla *iniciar o job* (POST rápido, `202 {taskId}`) de *ver a saída* (SSE reconectável). Sem isso, um `compose up` de 3 minutos morre no primeiro refresh do browser.

**`filesystem`** — isolado de propósito: é a superfície de ataque mais óbvia do app.

Em `stacks`, *discovery* (leitura via dockerode, barata, sem side effect) é deliberadamente separado de *execução* (spawn do CLI, com mutex).

## Frontend — `apps/web`

```
src/
├── api/          http.ts (baseURL + X-DockerLocal) · sse.ts (reconnect + Last-Event-ID)
│                 containers.api.ts · images.api.ts · volumes.api.ts · stacks.api.ts · fs.api.ts · tasks.api.ts
├── stores/       containers · images · volumes · stacks · tasks · events · ui
├── composables/  useDockerEvents · useLogStream · useTaskStream · useResourcePolling · useConfirm
├── components/
│   ├── layout/   AppShell · SideNav · StatusBar · TaskIndicator
│   ├── common/   ResourceTable · StateBadge · ConfirmDialog · ActionButtons · EmptyState
│   ├── logs/     LogViewer · LogToolbar          (StreamViewer serve logs E tasks)
│   ├── fs/       FileBrowserDialog · FileList · RootSelector
│   └── stacks/   StackCard · StackServiceRow
└── views/        ContainersView · ImagesView · VolumesView · StacksView · StackDetailView · SettingsView
```

### Padrão de resource store

Replicado para containers/images/volumes/stacks:

```ts
const items = shallowRef<ContainerSummary[]>([]);   // lista grande, troca inteira
const pending = reactive(new Set<string>());        // ids em transição → spinner na linha

async function act(id, action, opts?) {
  pending.add(id);
  try { await api[action](id, opts); await fetch(true); }
  finally { pending.delete(id); }
}
```

`pending` é o que faz a UI parecer responsiva sem optimistic update mentiroso: o botão vira spinner, a linha fica fosca, e o estado real chega do refetch.

### Push e polling, e por que os dois

**Push (primário):** um SSE em `/api/system/events/stream`. Ao chegar evento, a store faz **refetch debounced (300 ms)** do recurso afetado.

Não aplique delta a partir do evento. `docker events` não traz `Status`, nem portas, nem uptime — você acabaria com linhas pela metade. **O evento é invalidação de cache, não fonte de dados.**

**Polling (rede de segurança):** 10 s, suspenso enquanto o SSE está saudável, agressivo (3 s) se cair, e parado com `document.visibilityState === 'hidden'` — sem isso o app come CPU em aba de fundo o dia inteiro.

Após ação do usuário, refetch imediato — não espere o evento.

## Por que SSE

O fluxo é 100% unidirecional. `EventSource` traz reconexão automática e reenvio de `Last-Event-ID` de graça; sobre `ws` cru isso são ~150 linhas de código chato. `@Sse()` é nativo no Nest, socket.io custaria ~40 KB no bundle e um protocolo próprio que atrapalha para depurar, e SSE se inspeciona com `curl -N`.

O limite de **6 conexões HTTP/1.1 por origem** é a objeção real, e o design a respeita: no máximo 3 streams por aba (1 de eventos, 1 de logs, 1 de task), com logs de stack **agregados no servidor** num único SSE com campo `service` por linha. Se um dia precisar de N viewers, a saída é a mesma: multiplexar no backend.

WebSocket entra na fase 10, no `exec` — o único caso genuinamente bidirecional.

## Rodando em container

O container do app **não precisa do daemon**, só do CLI + plugins, porque tudo passa pelo socket montado.

O bind mount é **espelhado**: `/home/wesley/Documents/development` montado no mesmo caminho absoluto. O motivo é que quem monta os volumes das stacks alvo é o **daemon do host** — se o app enviasse `/projects/app/src`, o host tentaria montar um caminho que não existe lá. Espelhando, `working_dir` e `config_files` das labels batem, e todo bind relativo (`./src:/app/src`) resolve para um path real no host.

Permissão do socket: `user: "1000:1000"` + `group_add: ["${DOCKER_GID}"]`. Ver `docs/backlog/fase-09-empacotamento.md`.
