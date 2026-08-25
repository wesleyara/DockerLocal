# Fase 04 — Images e Volumes

## Objetivo

Duas abas novas, completas: listar, inspecionar, remover e fazer prune de imagens e volumes — com a informação que evita o erro 409 cego.

Fase de baixo risco: reaproveita `ResourceTable` e o padrão de store inteiros.

> Skills: `dockerode-streams` (seção 7), `vue-resource-ui` (seções 1 e 6)

## Tarefas

### Images

- [x] `ImagesService.list()` — `?all=false&dangling=`, normalizado (tags, tamanho, criação, id curto)
- [x] Imagem sem tag aparece como `<none>:<none>` e é marcada como dangling
- [x] `GET /api/images/:id` (inspect) e `/history`
- [x] `POST /api/images/:id/tag` — `{ repo, tag }`
- [x] `DELETE /api/images/:id?force=&noprune=`
- [x] `POST /api/images/prune` com `{ danglingOnly }`
- [x] `ImagesView.vue` — tags, id, tamanho, criação, badge de dangling; ação de prune no topo
- [x] Coluna "em uso por" quando houver container usando a imagem

### Volumes

- [x] `VolumesService.list()` — cruzar com `listContainers({all:true})` e olhar `Mounts[].Name` para montar `usedBy: string[]`
- [x] Extrair `compose.project` das labels do volume
- [x] `GET /api/volumes/:name` (inspect), `POST /api/volumes`, `DELETE /api/volumes/:name?force=`, `POST /api/volumes/prune`
- [x] Propagar `warnings` que o Docker retorna em `listVolumes`
- [x] `VolumesView.vue` — nome, driver, projeto, `usedBy`, mountpoint
- [x] Remoção de volume exige **digitar o nome** (destrói dado sem volta)
- [x] Prune de volumes com o mesmo nível de confirmação

## Critério de aceite

```bash
# comparar com a fonte da verdade, não com número fixo
diff <(curl -s localhost:5100/api/images | jq -r '.[].id[7:19]' | sort) \
     <(docker images -q | sort)

diff <(curl -s localhost:5100/api/volumes | jq -r '.volumes[].name' | sort) \
     <(docker volume ls -q | sort)
```

- `capp_backend_db` aparece com `usedBy: ["capp.backend"]` e projeto `capp`
- Imagem/volume com `usedBy` não vazio → botão "Remover" desabilitado na UI, com tooltip explicando quem está usando (bloqueado no cliente, não só tratado como 409)
- Remover imagem/volume em uso via API direta (contornando a UI) → 409 com mensagem legível e `canForce: true`; a UI, se pegar esse erro numa corrida rara, avisa mas não oferece forçar
- Prune de dangling remove só o que deve; a lista se atualiza pelo evento da fase 3
- Remoção de volume sem digitar o nome fica bloqueada
- Os dois `diff` acima saem vazios

## Arquivos previstos

```
apps/api/src/images/{images.module.ts,images.controller.ts,images.service.ts}
apps/api/src/volumes/{volumes.module.ts,volumes.controller.ts,volumes.service.ts}
packages/shared/src/{image.types.ts,volume.types.ts}
apps/web/src/api/{images.api.ts,volumes.api.ts}
apps/web/src/stores/{images.store.ts,volumes.store.ts}
apps/web/src/views/{ImagesView.vue,VolumesView.vue}
```

## Notas

**`usedBy` vale o custo.** Exige uma chamada extra e um cruzamento em memória, mas é a informação que o Docker Desktop mostra e que transforma um 409 opaco em "esse volume está preso no `capp.backend`". Sem isso o usuário tenta remover, leva erro e não sabe o que fazer.

**`force` em imagem usada por container parado** remove a imagem e deixa o container órfão — que depois não sobe mais. Por isso a UI bloqueia a remoção de imagem/volume em uso em vez de oferecer forçar (o backend ainda aceita `?force=true` via API direta, mas o app não expõe esse botão).

**`POST /api/images/pull` fica para a fase 5** — é o caso de teste da infra de Task.

**O diff de aceite dá falso positivo em imagem com múltiplas tags.** `docker images -q` imprime uma linha por tag (uma imagem com `latest` e `v3.7` sai duas vezes); nosso `/api/images` — como o Docker Desktop — devolve uma entrada por ID único com `repoTags: string[]`. Comparar com `sort -u` dos dois lados fecha o diff; é esperado, não é bug.
