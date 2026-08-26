# Fase 07 — Stacks (Compose)

## Objetivo

Ver `invest-broker` e `capp` agrupadas como stacks, com seus serviços, e dar `up`/`down`/`restart`/`build` acompanhando a saída ao vivo.

A fase se divide em duas metades independentes: **leitura** (dockerode, barata, sem side effect) e **execução** (spawn do CLI). Faça a leitura primeiro — ela já entrega uma tela útil.

> Skills: `compose-cli`, `nest-sse`

## Tarefas

### Metade 1 — discovery (leitura pura)

- [x] `StackDiscoveryService` — agrupar `listContainers({all:true})` por `com.docker.compose.project`
- [x] Extrair `working_dir`, `config_files` (split por `,`), `service`, `container-number`
- [x] **Filtrar `oneoff === 'True'`** — T maiúsculo; containers de `docker compose run` não são serviços da stack
- [x] Cruzar volumes e networks pelo mesmo label `project`
- [x] Derivar `status`: `running` | `partial` | `stopped`
- [x] Validar `config_files` com `fs.access` → `fileExists: false` vira badge "arquivo não encontrado"
- [x] `GET /api/stacks` e `GET /api/stacks/:project`
- [x] `StacksView.vue` com `StackCard.vue` e `StackServiceRow.vue`
- [x] `StackDetailView.vue` — serviços, containers, volumes, networks, conteúdo do compose

### Metade 2 — execução

- [x] `ComposeCliService.run()` — `spawn('docker', ['compose', '--progress','plain', '--ansi','never', '-p', project, ...configFiles.flatMap(f => ['-f', f]), ...args], { cwd: workingDir, shell: false })`
- [x] **Ler stdout E stderr** — o progresso do compose sai no stderr
- [x] Pipe pelo `LineSplitter`, emitindo no `TaskRegistry`
- [x] Cancelamento: `SIGINT`, com `SIGKILL` após 10 s
- [x] Validar `project` com `/^[a-z0-9][a-z0-9_-]*$/`, máx. 63 chars
- [x] `Mutex` por projeto — operação em stack ocupada → **409 com o `taskId` em andamento**
- [x] `up` / `down` / `start` / `stop` / `restart` / `build` / `pull` → `202 {taskId}`
- [x] **Fallback do `down`:** se o compose file sumiu, tentar `docker compose -p <project> down` sem `-f`
- [x] `GET /api/stacks/:project/config` — `docker compose config --format json`, em buffer (não é Task)
- [x] `StackRegistryService` — persistir compose files conhecidos em `~/.dockerlocal/stacks.json`
- [x] Listagem = união de `source: 'discovered'` + `source: 'registry'`
- [x] `DELETE /api/stacks/:project/registry`
- [x] `GET /api/stacks/:project/logs/stream` — **SSE agregado** dos serviços, campo `service` por linha; nunca N conexões

### Frontend

- [x] `stacks.store.ts`
- [x] Botões de ação no `StackCard`, abrindo o `TaskDrawer` da fase 5
- [x] `down -v` exige digitar o nome do projeto (destrói volumes)
- [x] Badge de origem (`discovered` / `registry`) e de arquivo ausente
- [x] Viewer de logs agregado com filtro por serviço

## Critério de aceite

```bash
curl -s localhost:5100/api/stacks | jq '.[].project'
# "invest-broker", "capp"

curl -s localhost:5100/api/stacks/invest-broker | jq '.services[].name'
# api, web, traefik, postgres, redis, redisinsight
```

- `invest-broker` aparece `running` (6/6); `capp` aparece `stopped` (0/4)
- `up` em `capp` pela UI: saída ao vivo no drawer, containers sobem, lista se atualiza
- `down` em `capp`: derruba tudo e a stack **continua na lista** com `source: 'registry'` (comprova o registry)
- **A UI não fica muda durante o `up`** — comprova que o stderr está sendo lido
- Nenhum código de escape ANSI na saída (comprova `--progress plain`)
- Task **`succeeded`** num `up` normal, mesmo com bastante conteúdo no stderr (só o exit code decide)
- Dois `up` simultâneos na mesma stack → o segundo leva 409 com o `taskId` do primeiro
- **Fallback:** renomear o compose de `capp`, tentar `down` → funciona pelo caminho sem `-f`. Restaurar o nome.
- `docker compose run` numa stack não polui a lista de serviços (teste do `oneoff`)

## Arquivos previstos

```
apps/api/src/stacks/{stacks.module.ts,stacks.controller.ts}
apps/api/src/stacks/{stack-discovery.service.ts,stack-registry.service.ts,compose-cli.service.ts}
apps/api/src/stacks/dto/{compose-up.dto.ts,compose-down.dto.ts}
apps/api/src/common/utils/mutex.ts
packages/shared/src/stack.types.ts
apps/web/src/api/stacks.api.ts
apps/web/src/stores/stacks.store.ts
apps/web/src/components/stacks/{StackCard.vue,StackServiceRow.vue}
apps/web/src/views/{StacksView.vue,StackDetailView.vue}
```

## As quatro armadilhas

**1. O progresso do compose sai no `stderr`.** Ler só stdout deixa a UI muda durante um `up` inteiro. Mostre os dois canais, `stderr` em cor distinta — mas **não trate como erro**. Só o exit code decide.

**2. `--progress plain` é obrigatório.** O modo padrão emite sequências de reposicionamento de cursor para desenhar barras de progresso. Num `<div>` isso vira sopa ilegível.

**3. `oneoff` é `'True'`, com T maiúsculo.** Comparar com `'true'` minúsculo faz containers de `compose run` aparecerem como serviços normais.

**4. Stack que sofreu `down` some do discovery.** Não sobra recurso nenhum com label. É exatamente o que o `StackRegistry` resolve — sem ele, o usuário derruba uma stack e ela desaparece da UI, sem como subir de novo.

## Segurança

`spawn` com array e `shell: false`, sempre. `project` e paths vêm do usuário: valide `project` com a regex, e todo path passa pelo `PathSafetyService` da fase 6. Zero `exec` com interpolação.
