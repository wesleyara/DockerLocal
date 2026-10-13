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

## 10.2 Terminal exec — ☑ concluído

O único caso genuinamente bidirecional do app — **aqui o WebSocket se paga** (ADR-04).

- [x] `socket.io` num Gateway do Nest em `/ws/exec` (`apps/api/src/exec/exec.gateway.ts`)
- [x] `container.exec({ AttachStdin, AttachStdout, AttachStderr, Tty: true, Cmd })` + `start({ hijack: true, stdin: true })`
- [x] Detectar shell disponível: tentar `/bin/bash`, cair para `/bin/sh` (imagens alpine não têm bash) — via `if [ -x /bin/bash ]` no `sh -c`, não `exec ... || fallback` (busybox `ash` mata o shell com exit 127 antes de chegar no `||`)
- [x] `@xterm/xterm` no front com `FitAddon` (`ContainerConsoleView.vue`)
- [x] Propagar resize: `exec.resize({ h, w })` a cada mudança de tamanho
- [x] Fechar o exec no disconnect do socket — mesmo cuidado de teardown dos logs
- [x] Validação de Origin/Host no handshake — WebSocket do browser não manda `X-DockerLocal`, então só o Origin protege aqui

Com `Tty: true` o stream **não é multiplexado** — `demuxStream` não é usado aqui.

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

## 10.6 Scan de vulnerabilidades — ☑ concluído

Não estava no backlog original — pedido por analogia ao "Docker Scan" do Docker Desktop, que foi descontinuado. Ver ADR-12.

- [x] Trivy (`aquasec/trivy`) como container sibling via `docker run` no mesmo socket, nunca instalado no host nem embutido na imagem do app
- [x] Cache de DB de CVEs em volume nomeado (`dockerlocal_trivy_cache`) — bind mount não funciona por causa do path do host no Docker-outside-of-Docker
- [x] Task de scan (`image-scan.service.ts`) com progresso via Task/SSE, igual pull/build
- [x] `ScanResult.vue` no drawer: vulnerabilidades por severidade + aba "Sem CVE" (SBOM completo cruzado com a lista de vulnerabilidades, dedup por `target+nome+versão`)
- [x] Escopo MVP: só `--scanners vuln` — sem secret scanning nem misconfig

## 10.7 Outras entregas fora do backlog original

Trabalho feito durante as fases 6-10 que não estava previsto nos arquivos de fase, registrado aqui para não se perder:

- [x] **Progresso por camada no pull de imagens e no `compose up`** — `image-pull.service.ts` e `compose-cli.service.ts` emitem progresso estruturado (`id/status/current/total`) via `--progress json`; `PullProgress.vue` reaproveitado nos dois casos
- [x] **Rebuild de stack/grupo** — botão `up --build --force-recreate` em `StackCard.vue` e `GroupActionButtons.vue` (containers agrupados por projeto compose)
- [x] **`CopyableText.vue`** — clique para copiar em tags de imagem e nomes longos nas tabelas
- [x] **Filtro do file browser por modo** — `FileList.vue` só lista entradas relevantes ao contexto (Dockerfile vs. compose), evitando ruído de `node_modules` e afins
- [x] **UX de import de stack** — detecção automática de `.env` na mesma pasta do compose escolhido, em vez de exigir seleção manual; mensagem explicativa no seletor de pastas quando não há raiz configurada ainda
- [x] **Proteção contra auto-remoção estendida a volumes nomeados** — `SelfDetectService.isSelfVolume()` cobre os volumes montados pelo próprio container (ex. `dockerlocal_data`), bloqueando `DELETE /api/volumes/:name` com 403 do mesmo jeito que já valia para containers/stacks/imagens (ADR-09); não cobre volumes de recursos sibling descartáveis como o cache do trivy

## 10.8 Auto-stop no boot — ☑ concluído

No boot da máquina o daemon sobe tudo que tem `restart: always/unless-stopped`. Esta entrega para todos os containers, exceto o DockerLocal e uma lista de exclusão editável na UI. Ver ADR-14.

- [x] `AutostopService` (`apps/api/src/autostop/`) roda em `OnApplicationBootstrap` e só age se o `boot_id` do kernel mudou desde o último registrado
- [x] Janela de ~120 s após o boot: containers que o daemon subir depois também são parados (eventos `start`)
- [x] Nunca para o próprio container, helpers (`com.dockerlocal.helper`) nem nomes da lista; falha em um container não aborta os demais
- [x] Lista, flag `enabled`, `lastBootId` e `lastRun` persistidos em `<DATA_DIR>/autostop.json` (`/data` em container)
- [x] `GET /api/autostop`, `POST /enabled`, `POST|DELETE /excluded`, `POST /run`
- [x] Aba "Auto-stop" (`AutoStopView.vue`): toggle geral, checkbox por container, órfãos removíveis, último resultado, "Executar agora"
- [x] Specs jest do serviço e da persistência

### Critério de aceite

- Com `lastBootId` diferente do `boot_id` atual em `autostop.json`, reiniciar o container `dockerlocal` para só os containers fora da lista
- Reiniciar de novo sem mudar o `boot_id` não para nada
- `docker compose up -d --force-recreate` preserva a lista

## 10.9 Navegador de volumes — ☑ concluído

Navegar, baixar, enviar e editar arquivos dentro de um volume nomeado, pela web, com URL própria (`/volumes/:name/files/...`).

- [x] `VolumeHelperService` — container `busybox` sibling por volume, sob demanda, TTL ocioso de 2 min, reap de órfãos no boot (ver ADR-13)
- [x] `VolumeFilesService` — listar via `exec` (argv fixo, `realpath` dentro do helper), ler/baixar/enviar via Archive API (`getArchive`/`putArchive`)
- [x] Rotas `GET/PUT/DELETE /api/volumes/:name/files*` (listar, ler, baixar, enviar, criar pasta, renomear, apagar)
- [x] Helper escondido de Containers, do `usedBy` de volumes e do stream de eventos
- [x] Volume `isSelf` sempre somente leitura (helper monta `:ro`, API recusa mutação com 403)
- [x] Upload com `Content-Length` obrigatório (até 1 GiB), conflito de nome vira `409` (`overwrite=true` sobrescreve), dono herdado da pasta pai
- [x] Edição de texto com checagem de `mtime` — save tardio vira `409 conflict: "modified"`
- [x] `VolumeFilesView.vue` — breadcrumb roteado, drag-and-drop, upload de pasta (`webkitdirectory`), preview/edição em drawer
- [x] Remoção/prune de volume libera o helper antes (senão ele prende o volume "em uso")

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
