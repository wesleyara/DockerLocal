# Fase 01 — Containers: listagem e ações

## Objetivo

Ver os containers da máquina numa tabela e conseguir parar, iniciar, reiniciar e remover cada um.

**Ao final desta fase o app já é útil** — dá para largar o `docker ps` para o caso comum.

> Skill: `dockerode-streams` (seções 7 e 8 — erros 409/404 e não vazar tipos)

## Tarefas

### Backend

- [ ] `ContainersService.list()` — `listContainers({all})` normalizado para `ContainerSummary`; **nunca** devolva `Dockerode.ContainerInfo` cru
- [ ] Extrair `compose` do summary a partir das labels `com.docker.compose.*`
- [ ] `ContainersService.inspect(id)` → `GET /api/containers/:id`
- [ ] Ações: `start`, `stop({t})`, `restart({t})`, `kill({signal})`, `pause`, `unpause`, `rename({name})`
- [ ] `DELETE /api/containers/:id?force=&v=` e `POST /api/containers/prune`
- [ ] `DockerExceptionFilter`: 404 → *"não encontrado (já foi removido?)"*; 409 → mensagem humana + `canForce: true`
- [ ] `OriginGuard` — valida `Origin` contra allowlist e `Host` contra `localhost|127.0.0.1|[::1]`; exige `X-DockerLocal: 1` em não-GET
- [ ] DTOs com `ZodValidationPipe`

### Frontend

- [ ] `containers.store.ts` no padrão de resource store (`shallowRef` + `pending: Set`)
- [ ] `ResourceTable.vue` genérico — colunas por slot, ações por linha, estado de transição
- [ ] `StateBadge.vue` (running/exited/paused/restarting/dead) e `RelativeTime.vue`
- [ ] `ContainersView.vue` — nome, imagem, estado, portas, uptime, projeto compose
- [ ] `ActionButtons.vue` com spinner enquanto o id está em `pending`
- [ ] `ConfirmDialog.vue` — remoção pede confirmação; `useConfirm()` composable
- [ ] Erro 409 na UI oferece **"Remover mesmo assim"** (usa `canForce`), avisando que `force` numa imagem em uso deixa container órfão
- [ ] Polling de 10 s com pausa em `visibilitychange`; refetch imediato após ação
- [ ] `EmptyState.vue` e `ErrorBanner.vue`

> Skill: `vue-resource-ui` (seções 1, 2 e 6)

## Critério de aceite

```bash
# comparar com a fonte da verdade, não com número fixo
diff <(curl -s 'localhost:5100/api/containers?all=true' | jq -r '.[].name' | sort) \
     <(docker ps -a --format '{{.Names}}' | sort)
```

- O `diff` acima sai vazio
- Parar `capp.frontend` pela UI e confirmar com `docker ps -a` no terminal
- Durante a ação, a linha mostra spinner e fica fosca; o estado real chega depois
- Tentar remover um container rodando → 409 com mensagem legível e opção de forçar
- `POST` sem o header `X-DockerLocal: 1` → **403**
- `POST` com `Origin: http://evil.com` → **403**
- Containers de `invest-broker` aparecem com o projeto na coluna correspondente

## Arquivos previstos

```
apps/api/src/containers/{containers.module.ts,containers.controller.ts,containers.service.ts}
apps/api/src/containers/dto/{list-containers.dto.ts,remove-container.dto.ts}
apps/api/src/common/guards/origin.guard.ts
apps/api/src/common/filters/docker-exception.filter.ts
apps/api/src/common/pipes/zod-validation.pipe.ts
packages/shared/src/container.types.ts
apps/web/src/api/containers.api.ts
apps/web/src/stores/{containers.store.ts,ui.store.ts}
apps/web/src/composables/{useResourcePolling.ts,useConfirm.ts}
apps/web/src/components/common/{ResourceTable.vue,StateBadge.vue,ActionButtons.vue,ConfirmDialog.vue,EmptyState.vue,ErrorBanner.vue,RelativeTime.vue}
apps/web/src/views/ContainersView.vue
```

## Riscos tratados aqui

**`@types/dockerode` mente.** A tipagem 4.0.1 não cobre tudo da API 1.55. Trate dockerode como fonte não tipada na fronteira do service e normalize para `packages/shared`. Isso importa mais na fase 2, onde `container.logs()` tem retorno condicional não tipado — mas a fronteira se estabelece aqui.

**`OriginGuard` é a defesa principal do app**, mais que autenticação. A ameaça real é uma aba de browser em site malicioso fazendo `POST http://127.0.0.1:5100/api/containers/x/start` — sem CORS, um `<form>` consegue. Ver ADR-07.
