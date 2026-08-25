# Fase 08 — Criação a partir de arquivo

## Objetivo

Escolher um `Dockerfile` pela UI e buildar a imagem. Escolher um `docker-compose.yml` e subir a stack.

**Fecha o MVP.** Junta file browser (fase 6), Tasks (fase 5) e execução por CLI (fase 7).

> Skills: `compose-cli` (seção 6), `dockerode-streams` (seções 4 e 6)

## Tarefas

### Build de imagem

- [ ] `ImageBuildCliService` — caminho **padrão** (`engine: 'cli'`):
      `spawn('docker', ['build','--progress','plain','-f',dockerfileAbs, ...tags.flatMap(t=>['-t',t]), ...buildArgs, contextPath])`
- [ ] `POST /api/images/build` → `202 {taskId}`, emitindo no `TaskRegistry`
- [ ] Validar `contextPath` e `dockerfile` pelo `PathSafetyService`
- [ ] Validar tags contra o formato de referência antes de virarem `-t`
- [ ] Rejeitar Dockerfile **fora** do contexto com 400 e mensagem explícita (`path.relative` começando com `..`)
- [ ] Avisar quando o contexto tiver mais de ~20 mil arquivos (contexto sem `.dockerignore` trava por minutos)
- [ ] `ImageBuildService` — fallback `engine: 'api'` com `dockerode.buildImage` + `tar-fs` + `ignore`:
  - `ignore` recebe path **absoluto** do tar-fs; relativizar e normalizar separadores antes de consultar o `.dockerignore`
  - opção `dockerfile` é **relativa à raiz do contexto**, com `/` — path absoluto dá `Cannot locate specified Dockerfile`
  - `followProgress` checando `errorDetail` (build falho retorna HTTP 200)
  - capturar `aux.ID` do último evento como `imageId`; tags extras via `getImage(id).tag()`

### Stack a partir de arquivo

- [ ] `POST /api/stacks/from-file` — `{ composeFilePath, projectName?, envFile?, up? }` → `202 {taskId}`
- [ ] Nome de projeto default = nome do diretório, sanitizado pela regex
- [ ] Registrar no `StackRegistry` antes de subir, para a stack aparecer mesmo se o `up` falhar
- [ ] Rodar `docker compose config` antes do `up` — valida o arquivo e dá erro legível em vez de falha críptica no meio
- [ ] Detectar `include:` / `extends:` apontando para fora da raiz espelhada e avisar (quebra em container, fase 9)

### Frontend

- [ ] `BuildImageDialog.vue` — contexto e Dockerfile via `FileBrowserDialog`, campos de tags, build args (pares chave/valor), `--no-cache`, target
- [ ] Ao escolher um Dockerfile, sugerir o diretório dele como contexto
- [ ] `CreateStackDialog.vue` — compose file via browser, nome do projeto (pré-preenchido), `.env` opcional, checkbox "subir agora"
- [ ] Preview do arquivo escolhido antes de confirmar (via `/api/fs/read`)
- [ ] Ambos disparam a Task e abrem o `TaskDrawer`
- [ ] Sucesso → refetch da lista correspondente

## Critério de aceite

```bash
# Build pela UI a partir de um Dockerfile real do disco
docker images | grep <tag-escolhida>     # a imagem existe

# Stack a partir de arquivo
curl -s -X POST localhost:5100/api/stacks/from-file \
  -H 'Content-Type: application/json' -H 'X-DockerLocal: 1' \
  -d '{"composeFilePath":"/home/wesley/Documents/development/capp/docker-compose.yml","up":true}'
```

- Escolher um Dockerfile pelo browser, buildar, e ver a imagem em `docker images`
- A saída do build aparece ao vivo, em linhas legíveis (comprova `--progress plain`)
- **Build quebrado** (`RUN exit 1`) → task **`failed`** com o erro visível, não `succeeded`
- Dockerfile fora do contexto → 400 com mensagem explícita, não erro do daemon
- Subir uma stack a partir de um compose escolhido: containers sobem e a stack aparece na aba
- Compose inválido → erro legível vindo do `config`, antes de tentar o `up`
- F5 no meio de um build longo: a saída volta completa (Task da fase 5 funcionando)

## Arquivos previstos

```
apps/api/src/images/{image-build-cli.service.ts,image-build.service.ts}
apps/api/src/images/dto/build-image.dto.ts
apps/api/src/stacks/dto/create-stack.dto.ts
apps/web/src/views/{BuildImageDialog.vue,CreateStackDialog.vue}
```

## Por que dois caminhos de build

`engine: 'cli'` é o padrão: usa BuildKit, respeita `.dockerignore` nativamente, cache moderno, mesma infra de Task do compose, e zero código de montagem de tar.

`engine: 'api'` existe porque não depende do CLI e dá eventos JSON estruturados. Limitações aceitas: sem cache mount, sem multi-stage paralelo, sem `--secret` — o `POST /build` do dockerode usa o builder clássico, que no Docker 29 já avisa que será removido (ADR-03).

## Armadilha

**Build falho responde HTTP 200.** No caminho `api`, o erro chega como evento com `errorDetail` no meio do fluxo do `followProgress`. Sem checar, o app reporta sucesso num build quebrado e o usuário só descobre quando a imagem não está lá.
