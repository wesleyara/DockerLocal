# Fase 10 — Pós-MVP

O MVP fecha na fase 9. O que segue é priorizado por valor, não por dependência — cada bloco é independente.

## 10.1 Stats em tempo real

Reaproveita quase toda a infra de logs.

- [ ] `GET /api/containers/:id/stats/stream` — `container.stats({stream:true})` via `@Sse`
- [ ] Calcular percentual de CPU: precisa da **delta entre duas leituras** (`cpu_stats` vs `precpu_stats`), não do valor absoluto — o primeiro sample sempre sai zerado
- [ ] Memória: usar `usage - stats.cache` (o `usage` cru superestima)
- [ ] Refcount e teardown como no `LogSessionService`
- [ ] Sparklines de CPU/memória por linha na tabela de containers
- [ ] Painel de detalhe com rede e I/O de bloco

Cuidado com o orçamento de conexões SSE (máx. 3 por aba). Stats de vários containers devem ser **agregados num único stream**, não uma conexão por linha.

> Skill: `nest-sse` (seção "Orçamento de conexões")

## 10.2 Terminal exec

O único caso genuinamente bidirecional do app — **aqui o WebSocket se paga** (ADR-04).

- [ ] `socket.io` num Gateway do Nest em `/ws/exec`
- [ ] `container.exec({ AttachStdin, AttachStdout, AttachStderr, Tty: true, Cmd })` + `start({ hijack: true, stdin: true })`
- [ ] Detectar shell disponível: tentar `/bin/bash`, cair para `/bin/sh` (imagens alpine não têm bash)
- [ ] `@xterm/xterm` no front com `FitAddon`
- [ ] Propagar resize: `exec.resize({ h, w })` a cada mudança de tamanho, senão o `vim` desenha errado
- [ ] Fechar o exec no disconnect do socket — mesmo cuidado de teardown dos logs

Com `Tty: true` o stream **não é multiplexado** — não use `demuxStream` aqui.

## 10.3 Inspect / detalhes

- [ ] Drawer com o JSON de inspect formatado e navegável
- [ ] Abas: geral, environment, portas, mounts, networks, healthcheck
- [ ] **Nunca logar nem exibir `Config.Env` sem mascarar** — senhas em texto claro; mascarar valores de chaves com `PASSWORD|SECRET|TOKEN|KEY` e exigir clique para revelar
- [ ] Botão "copiar como `docker run`"

## 10.4 Networks

Quarta aba, mesmo padrão das outras.

- [ ] `GET /api/networks`, `/:id`, `DELETE`, `POST /prune`
- [ ] `usedBy` cruzando com containers, como nos volumes
- [ ] Marcar `bridge`, `host` e `none` como não-removíveis
- [ ] Conectar/desconectar container de uma network

## 10.5 Criar container a partir de imagem

- [ ] Formulário: imagem, nome, portas, env, volumes, restart policy, network
- [ ] `POST /api/containers/create` → `docker.createContainer()`
- [ ] Preview do `docker run` equivalente antes de confirmar

## Ideias sem prioridade

- Busca global (⌘K) entre containers, imagens, volumes e stacks
- Editor do compose file na UI, com validação por `docker compose config`
- Notificação quando um container sai com código diferente de zero
- Filtro salvo por projeto compose
- Dark mode
- Export de logs com intervalo de tempo
- Histórico de tasks persistido entre reinícios

## Débito técnico a revisitar

- **Tipos do dockerode** — se `@types/dockerode` continuar defasado em relação à API 1.55, considerar tipos próprios em `packages/shared` para a superfície que o app usa
- **Builder clássico** — quando o `POST /build` for removido do Docker, apagar o caminho `engine: 'api'` e o código de `tar-fs`
- **Limite de 6 conexões HTTP/1.1** — se o app passar a servir HTTP/2, o teto de 3 SSE por aba pode ser relaxado
- **`compression`** — continua proibido no Express enquanto houver SSE sem filtro por content-type
