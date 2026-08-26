# Fase 09 — Empacotamento

## Objetivo

Subir o DockerLocal como container e ter tudo funcionando igual — inclusive build e compose de projetos do host. Junto disso, uma CLI própria (`dockerlocal`) no estilo da CLI do `kind`: um binário que sobe/derruba o container da aplicação e ajusta configs como restart policy, sem precisar lembrar flags de `docker compose`.

O passo que prova o bind espelhado é a **fase 8 repetida de dentro do container**.

> Skill: `compose-cli` (seção 8)

## Tarefas

### Dockerfile

- [x] Multi-stage: build do `web` (Vite) + build do `api` (Nest) → runtime `node:24-bookworm-slim`
- [x] Copiar CLI e plugins de imagens oficiais:
  ```dockerfile
  COPY --from=docker:29-cli            /usr/local/bin/docker /usr/local/bin/docker
  COPY --from=docker/compose-bin:v5    /docker-compose  /usr/local/libexec/docker/cli-plugins/docker-compose
  COPY --from=docker/buildx-bin:latest /buildx          /usr/local/libexec/docker/cli-plugins/docker-buildx
  ```
- [x] `RUN docker compose version && docker buildx version` — falha cedo se a tag mudar de layout
- [x] `ENV DOCKER_CONFIG=/data/.docker`
- [x] `ServeStaticModule` no Nest servindo o build do web (front e API na mesma origem em prod)
- [x] Healthcheck apontando para `/api/system/ping`
- [x] Rodar como usuário não-root

### docker-compose.yml do próprio app

- [x] `ports: ["127.0.0.1:5100:5100"]` — **com o prefixo de loopback**
- [x] `user: "1000:1000"` + `group_add: ["${DOCKER_GID}"]`
- [x] `volumes:` socket + bind **espelhado** da raiz de projetos (mesmo caminho dos dois lados)
- [x] Volume nomeado em `/data` para `stacks.json` e `DOCKER_CONFIG`
- [x] `environment: HOME=/home/wesley` — compose alvo que usa `~`/`${HOME}` resolve errado sem isso
- [x] Label própria `com.dockerlocal.self=true`
- [x] `.env.example` com `DOCKER_GID` e o comando para obtê-lo

### Auto-preservação

- [x] Detectar o próprio container — label `com.dockerlocal.self`, `HOSTNAME`, ou `/proc/self/cgroup`
- [x] `isSelf: true` no `ContainerSummary` e no `StackSummary`
- [x] **Bloquear** stop/remove/restart no próprio container e `down` na própria stack, com mensagem explicando
- [x] Bloquear remoção da própria imagem
- [x] Front desabilita as ações e mostra badge "este app"

### Configuração do file browser pela UI

Hoje `FS_ROOTS` só é lido do `.env` no boot (`SettingsView.vue` é read-only, fase 6). Empacotado em container, editar `.env` e reiniciar para adicionar uma raiz é atrito — vira o momento certo de tornar isso editável em runtime, direto na UI.

- [x] `SettingsView.vue` ganha formulário para adicionar/remover raiz (não só listar)
- [x] `POST /api/fs/roots` — adiciona uma raiz nova; valida com `realpath` e as mesmas regras do `PathSafetyService` da fase 6 (rejeita path relativo, symlink pra fora, etc.)
- [x] `DELETE /api/fs/roots` — remove uma raiz
- [x] Persistir em `~/.dockerlocal/config.json` (mesmo padrão do `stacks.json` da fase 7), não só no `.env` — o `.env` é fixo no boot, a UI precisa alterar em runtime sem reiniciar o processo
- [x] `PathSafetyService` recarrega as raízes quando o config muda, sem exigir restart da API
- [x] Raiz adicionada pela UI dentro de um container: mostrar aviso claro se o caminho não existir no bind espelhado — mesmo problema de `HOME`/`~` descrito em "As três armadilhas"

### CLI (`dockerlocal`) — estilo `kind` — **SUPERSEDIDA, ver ADR-11**

> A CLI abaixo foi implementada e depois **removida**. Ela ainda exigia Node instalado pra rodar, o que contradizia sua própria razão de existir (reduzir fricção). Foi trocada por um binário standalone (`pnpm build:binary`, ver README e ADR-11 em `docs/decisoes.md`) que embute a API + o front inteiros via Node SEA — sem precisar de Node instalado pra RODAR, só pra buildar. A lista de tarefas fica registrada aqui como histórico, não como trabalho pendente.

- [x] ~~Pacote `apps/cli`, publicado com `bin` no `package.json`~~ — removido
- [x] ~~`dockerlocal up/down/start/stop/restart/status/logs/config`~~ — substituído por rodar o binário standalone direto, ou `docker compose up/down` direto
- [x] ~~Flags globais estilo kind, `--help`, `--version`~~
- [x] ~~Mensagens de erro reusam os checks da fase 0~~ — o binário standalone reusa a validação real da API (`env.schema.ts`/`docker.service.ts`), não uma cópia numa CLI separada

### README

- [x] Passo a passo: `getent group docker | cut -d: -f3` → `DOCKER_GID` no `.env`
- [x] Explicar por que o bind é espelhado (e por que não montar `/`)
- [x] Modo nativo (`pnpm dev`) vs container, e quando usar cada um
- [x] Referência rápida da CLI (`dockerlocal up|down|start|stop|restart|status|logs|config`)

## Critério de aceite

```bash
echo "DOCKER_GID=$(getent group docker | cut -d: -f3)" >> .env
docker compose up -d
curl -s localhost:5100/api/system/ping
```

- O app roda em container e as fases 1–8 continuam funcionando
- **O teste que prova o espelhamento:** buildar uma imagem a partir de um Dockerfile do host, e subir a stack `capp` — ambos de dentro do container. Se os paths não batessem, os bind mounts do `capp` falhariam.
- `docker ps --format '{{.Ports}}'` mostra `127.0.0.1:5100->5100/tcp`, **não** `0.0.0.0:5100`
- De outra máquina na LAN, `curl <ip-desta>:5100` → recusa conexão
- O próprio container aparece na lista com badge "este app" e ações destrutivas desabilitadas
- `POST /api/containers/<id-do-self>/stop` → **403** com mensagem clara
- Sem `DOCKER_GID` no `.env` → erro claro *"sem permissão no socket"* (check da fase 0), não `EACCES` cru

```bash
# bloco acima é equivalente a `docker compose up -d` / `down` / `restart` direto —
# a CLI que faria esse wrapper foi removida (ver ADR-11); use compose puro.
```

Critério de aceite do binário standalone (ver ADR-11 / README):

```bash
pnpm build:binary --target=linux-x64
./dist-bin/dockerlocal-linux-x64
curl -s localhost:5100/api/system/ping
```

- Sobe sem Docker instalado no host que roda o binário — Docker só é necessário pra ele ter o que gerenciar, não pra ele mesmo rodar
- Sem `.env` nenhum, sobe com defaults seguros (`HOST=127.0.0.1`) em vez de crashar
- `docker compose down` no bloco original continua removendo o container; volume nomeado sobrevive sem `-v`

## Arquivos previstos

```
Dockerfile · docker-compose.yml · .dockerignore · .env.example · README.md
apps/api/src/static/web-assets.generated.ts   (stub — preenchido só no bundle do binário standalone)
apps/api/src/docker/self-detect.service.ts
scripts/build-binary.mjs                      (bin standalone — ver ADR-11, substitui a CLI)
```

## As três armadilhas

**1. Publicar porta em container fura o firewall.** `ports: ["5100:5100"]` expõe o app na LAN mesmo com UFW ativo — a regra do Docker vai na `DOCKER-USER`/nat e o firewall não a vê. Sempre `127.0.0.1:5100:5100`. Dado que o app tem controle total do daemon, isso seria root remoto sem autenticação.

**2. Auto-destruição.** Se o DockerLocal rodar como stack, ele aparece na própria lista, e um `down` o mata no meio do request — sem resposta, sem log, usuário sem entender o que houve. Daí o `isSelf`.

**3. `HOME` no bind espelhado.** Dentro do container o `HOME` do node é `/root` ou `/home/node`. Um compose alvo que use `~` ou `${HOME}` resolve para um caminho que não existe no host. `HOME=/home/wesley` no environment resolve o caso comum; `include:`/`extends:` apontando para fora da raiz espelhada continua quebrando — detecte no `compose config` e mostre aviso claro (fase 8).

## Por que espelhado

Quem monta os volumes das stacks alvo é o **daemon do host**. Se o app enviasse `/projects/app/src`, o host tentaria montar um caminho que não existe lá. Montando `/home/wesley/Documents/development` no mesmo caminho absoluto, `working_dir` e `config_files` das labels batem e todo bind relativo (`./src:/app/src`) resolve para um path real no host.

E não espelhe `/` "por garantia" — é o oposto de segurança.
