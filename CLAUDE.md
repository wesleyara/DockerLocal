# DockerLocal

Um "Docker Desktop" próprio, web, rodando em localhost. Abas de **Containers**, **Images**, **Volumes** e **Stacks**, com start/stop/remove, logs em tempo real e criação de imagens/containers a partir de um `docker-compose.yml` ou `Dockerfile` escolhido na UI.

O trabalho é guiado por `docs/backlog/` — fases numeradas, cada uma terminando com algo visível funcionando. Comece sempre pela fase não concluída de menor número.

## Stack

pnpm workspaces: `apps/api` (NestJS + Express), `apps/web` (Vue 3 + Vite + Pinia + Tailwind 4), `packages/shared` (tipos, consumido via TS path — não tem build).

Versões travadas em `docs/decisoes.md`. Node v24, pnpm 11.

## As quatro regras que governam o código

**1. dockerode para a Engine API, CLI para orquestração.**
Listagem, inspect, start/stop/restart/remove, prune, logs e stats vão por `dockerode` no socket. Compose e build vão por `spawn` do CLI — a Engine API não tem nenhum conceito de "stack", e o builder clássico do `POST /build` está deprecado no Docker 29. Nunca parseie saída de `docker ps`; nunca tente reimplementar compose.

**2. Streaming é SSE, não WebSocket.**
Logs, eventos do daemon, saída de build/compose e stats são todos unidirecionais. Use `@Sse()` do Nest devolvendo `Observable<MessageEvent>` e `EventSource` no cliente. WebSocket só entra na fase 10, para o terminal `exec`.
Teto de projeto: **no máximo 3 SSE simultâneos por aba** (HTTP/1.1 limita a 6 por origem). Logs de múltiplos containers são agregados no servidor, nunca N conexões.

**3. Job longo vira Task.**
Qualquer operação que demore e produza texto — build, `compose up`, `pull` — passa pelo `TaskRegistry`: o POST responde `202 {taskId}` na hora, e a saída sai por `GET /api/tasks/:id/stream`. Isso é o que faz um `up` de 3 minutos sobreviver a um F5.

**4. Nada do cliente chega a um shell.**
`spawn` com array de argumentos e `shell: false`, sempre. Zero `exec`/`execSync` com interpolação. Todo path vindo do cliente passa por `PathSafetyService.resolveSafe()` antes de qualquer uso.

## Comandos

```bash
pnpm dev                      # api (5100) + web (5551) juntos
pnpm --filter api dev
pnpm --filter api test
pnpm build

curl -N localhost:5100/api/containers/<id>/logs/stream   # depurar SSE direto
```

## Fixtures reais da máquina

Não invente containers de teste — a máquina já tem os casos difíceis:

| Recurso | Por que serve |
|---|---|
| `invest-broker` (rodando, 6 serviços) | stack completa, `invest-broker-api` é verboso — testa volume de log e virtual scroll |
| `capp` (parado, 4 containers) | stack com todos os containers exited — testa discovery por label sem nada rodando |

Para testar TTY, suba algo com `-t` — o caminho de demux **ramifica** por `Config.Tty` e os dois lados precisam de teste.

## Ambiente

Docker Engine 29.7.1, API 1.55. Compose plugin v5.4.0. Buildx v0.36.0.

O socket é `/var/run/docker.sock` (`root:docker`, `660`). O GID do grupo `docker` **nesta máquina** é `973`, mas isso varia por máquina — sempre venha de `DOCKER_GID` no `.env`, obtido com `getent group docker | cut -d: -f3`. Nunca hardcode.

## Segurança

O app tem controle total do daemon: quem alcança a API pode virar root do host. O modelo de ameaça não é "atacante na rede" — é **uma aba de browser em site malicioso fazendo POST para localhost**.

- Bind em `127.0.0.1`. Em container, `ports: ["127.0.0.1:5100:5100"]` — sem o prefixo, o Docker abre na LAN e **fura o UFW**.
- `OriginGuard` valida `Origin` e `Host`, e exige header `X-DockerLocal: 1` em métodos não-GET.
- File browser: `realpath` **antes** da comparação de prefixo, e compare com `raiz + path.sep`.

## Referências

- `docs/arquitetura.md` — estrutura de módulos e o porquê de cada um
- `docs/api-contrato.md` — endpoints REST e canais SSE
- `docs/decisoes.md` — ADRs, versões travadas
- `docs/backlog/` — fases e tarefas

Há skills em `.claude/skills/` cobrindo as pegadinhas de dockerode/streams, compose CLI, SSE no Nest e a UI de recursos no Vue. Consulte a relevante antes de mexer nessas áreas — são erros que custam horas quando descobertos na tela.
