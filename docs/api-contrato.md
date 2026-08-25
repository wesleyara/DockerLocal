# Contrato de API

Prefixo global `/api`. Porta padrão **5100**.

Convenção: POST destrutivo instantâneo → `200 {ok:true}`. POST longo (build, compose, pull) → `202 {taskId}`, saída via SSE em `/api/tasks/:id/stream`.

Métodos não-GET exigem header `X-DockerLocal: 1` (ver `OriginGuard` em `docs/arquitetura.md`).

---

## System

| Método | Path | Retorno |
|---|---|---|
| GET | `/api/system/ping` | `{ ok, apiVersion, engineVersion }` |
| GET | `/api/system/info` | `{ containers, images, serverVersion, ncpu, memTotal, activeLogSessions }` |
| GET | `/api/system/df` | uso de disco por tipo |
| GET | `/api/system/events/stream` | **SSE** — `?types=container,image,volume,network` |

`activeLogSessions` existe para tornar vazamento de stream **observável**. Se subir sem parar, há teardown faltando.

Evento SSE `docker-event`:
```jsonc
{ "type": "container", "action": "start", "id": "abc123",
  "name": "invest-broker-api", "project": "invest-broker", "time": 1756000000 }
```

---

## Containers

| Método | Path | Payload / Query |
|---|---|---|
| GET | `/api/containers` | `?all=true&project=&status=` → `ContainerSummary[]` |
| GET | `/api/containers/:id` | inspect completo |
| POST | `/api/containers/:id/start` | — |
| POST | `/api/containers/:id/stop` | `{ t?: number }` |
| POST | `/api/containers/:id/restart` | `{ t?: number }` |
| POST | `/api/containers/:id/kill` | `{ signal?: 'SIGTERM' }` |
| POST | `/api/containers/:id/pause` \| `/unpause` | — |
| POST | `/api/containers/:id/rename` | `{ name }` |
| DELETE | `/api/containers/:id` | `?force=&v=` (`v` = volumes anônimos) |
| POST | `/api/containers/prune` | — |
| GET | `/api/containers/:id/logs` | `?tail=500&since=&timestamps=` → snapshot, sem follow |
| GET | `/api/containers/:id/logs/stream` | `?tail=500&timestamps=&stdout=1&stderr=1` → **SSE** |
| GET | `/api/containers/:id/stats/stream` | **SSE** — fase 10 |

```ts
ContainerSummary = {
  id, shortId, name, names: string[], image, imageId, command,
  state: 'running'|'exited'|'created'|'paused'|'restarting'|'dead',
  status: string, createdAt: number,
  ports: Array<{ ip?: string; private: number; public?: number; type: string }>,
  labels: Record<string, string>,
  compose?: { project, service, containerNumber, configFiles: string[], workingDir },
  isSelf: boolean,
}
```

`isSelf` marca o container do próprio DockerLocal — o front bloqueia ações destrutivas nele (fase 9).

Eventos do stream de logs:
- `event: logs` → `{ lines: [{ t, s: 'stdout'|'stderr', text }], dropped: number }` (em lotes de 100 ms)
- `event: log-end` → `{ reason: 'container-stopped'|'removed'|'error' }`
- `event: ping` → heartbeat a cada 20 s

---

## Images

| Método | Path | Payload |
|---|---|---|
| GET | `/api/images` | `?all=false&dangling=` |
| GET | `/api/images/:id` | inspect |
| GET | `/api/images/:id/history` | — |
| POST | `/api/images/:id/tag` | `{ repo, tag }` |
| DELETE | `/api/images/:id` | `?force=&noprune=` |
| POST | `/api/images/prune` | `{ danglingOnly?: boolean }` |
| POST | `/api/images/pull` | `{ ref: "nginx:alpine" }` → `202 {taskId}` |
| POST | `/api/images/build` | ↓ → `202 {taskId}` |

```jsonc
// POST /api/images/build
{ "contextPath": "/home/wesley/Documents/development/Capp",
  "dockerfile": "backend/Dockerfile",     // RELATIVO ao contexto, com "/"
  "tags": ["capp-backend:dev"],
  "buildArgs": { "NODE_ENV": "development" },
  "target": null, "noCache": false, "pull": false,
  "engine": "cli" }                        // "cli" (BuildKit, padrão) | "api" (dockerode)
```

---

## Volumes

| Método | Path | Payload |
|---|---|---|
| GET | `/api/volumes` | → `{ volumes, warnings }` |
| GET | `/api/volumes/:name` | inspect |
| POST | `/api/volumes` | `{ name, driver?, labels? }` |
| DELETE | `/api/volumes/:name` | `?force=` |
| POST | `/api/volumes/prune` | — |

Cada volume vem enriquecido com `usedBy: string[]` e `compose?.project`. Montar `usedBy` exige cruzar com `listContainers({all:true})` e olhar `Mounts[].Name` — vale o custo: é a informação que evita o 409 cego.

---

## Stacks

| Método | Path | Payload |
|---|---|---|
| GET | `/api/stacks` | → `StackSummary[]` |
| GET | `/api/stacks/:project` | serviços, containers, volumes, networks, conteúdo do arquivo |
| GET | `/api/stacks/:project/config` | saída de `docker compose config --format json` |
| POST | `/api/stacks/:project/up` | `{ services?, build?, forceRecreate?, pull?: 'missing'\|'always' }` → `202` |
| POST | `/api/stacks/:project/down` | `{ removeVolumes?, removeOrphans?, rmi?: 'local'\|'all' }` → `202` |
| POST | `/api/stacks/:project/start` \| `/stop` \| `/restart` | `{ services? }` → `202` |
| POST | `/api/stacks/:project/build` | `{ services?, noCache? }` → `202` |
| POST | `/api/stacks/:project/pull` | → `202` |
| GET | `/api/stacks/:project/logs/stream` | `?services=api,web&tail=200` → **SSE agregado** |
| POST | `/api/stacks/from-file` | `{ composeFilePath, projectName?, envFile?, up? }` → `202` |
| DELETE | `/api/stacks/:project/registry` | remove do registro local, não mexe no Docker |

```ts
StackSummary = {
  project: string;
  workingDir: string | null;
  configFiles: string[];
  services: Array<{ name: string; containers: ContainerSummary[];
                    state: 'running'|'partial'|'stopped' }>;
  running: number; total: number;
  status: 'running'|'partial'|'stopped'|'unknown';
  source: 'discovered' | 'registry';   // viva no daemon vs. só conhecida
  fileExists: boolean;                 // config_files ainda existe no disco?
  isSelf: boolean;
}
```

Operação numa stack já ocupada → `409` com o `taskId` em andamento (mutex por projeto).

---

## Filesystem

| Método | Path | Query | Retorno |
|---|---|---|---|
| GET | `/api/fs/roots` | — | `[{ label, path }]` |
| GET | `/api/fs/list` | `?path=&showHidden=false` | `{ path, parent, entries[] }` |
| GET | `/api/fs/detect` | `?path=` | `{ kind, composeFiles[], dockerfiles[] }` |
| GET | `/api/fs/read` | `?path=` | `{ content, truncated }` |

```ts
FsEntry = { name, path, type: 'dir'|'file'|'symlink', size, mtime,
            isCompose: boolean, isDockerfile: boolean }
```

`parent` vem `null` quando `path` é uma raiz — o front não deve permitir navegar acima.

`/api/fs/read` tem allowlist de nomes (`Dockerfile*`, `*.yml`, `*.yaml`), limite de 512 KB, e **bloqueia `.env`, `*.pem`, `*.key`**. O browser precisa poder *selecionar* um `.env` como argumento do compose, mas nunca *exibir* seu conteúdo.

---

## Tasks

| Método | Path |
|---|---|
| GET | `/api/tasks?active=true` |
| GET | `/api/tasks/:id` |
| GET | `/api/tasks/:id/stream` — **SSE**: replay do ring buffer, depois ao vivo |
| POST | `/api/tasks/:id/cancel` |
| DELETE | `/api/tasks/:id` (só se finalizada) |

- `event: line` → `{ seq, s: 'stdout'|'stderr', text }`
- `event: status` → `{ status, exitCode? }`

O `seq` vai no campo `id:` do SSE. No reconnect o browser reenvia `Last-Event-ID` e o servidor retoma do ponto certo — é a razão de usar SSE aqui em vez de WebSocket.

---

## WebSocket

**Nenhum no MVP.** Fase 10: `ws://localhost:5100/ws/exec` (Gateway socket.io) para o terminal xterm.js — único caso genuinamente bidirecional.
