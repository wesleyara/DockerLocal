# Fase 09 — Empacotamento

## Objetivo

Subir o DockerLocal como container e ter tudo funcionando igual — inclusive build e compose de projetos do host. Junto disso, uma CLI própria (`dockerlocal`) no estilo da CLI do `kind`: um binário que sobe/derruba o container da aplicação e ajusta configs como restart policy, sem precisar lembrar flags de `docker compose`.

O passo que prova o bind espelhado é a **fase 8 repetida de dentro do container**.

> Skill: `compose-cli` (seção 8)

## Tarefas

### Dockerfile

- [ ] Multi-stage: build do `web` (Vite) + build do `api` (Nest) → runtime `node:24-bookworm-slim`
- [ ] Copiar CLI e plugins de imagens oficiais:
  ```dockerfile
  COPY --from=docker:29-cli            /usr/local/bin/docker /usr/local/bin/docker
  COPY --from=docker/compose-bin:v5    /docker-compose  /usr/local/libexec/docker/cli-plugins/docker-compose
  COPY --from=docker/buildx-bin:latest /buildx          /usr/local/libexec/docker/cli-plugins/docker-buildx
  ```
- [ ] `RUN docker compose version && docker buildx version` — falha cedo se a tag mudar de layout
- [ ] `ENV DOCKER_CONFIG=/data/.docker`
- [ ] `ServeStaticModule` no Nest servindo o build do web (front e API na mesma origem em prod)
- [ ] Healthcheck apontando para `/api/system/ping`
- [ ] Rodar como usuário não-root

### docker-compose.yml do próprio app

- [ ] `ports: ["127.0.0.1:5100:5100"]` — **com o prefixo de loopback**
- [ ] `user: "1000:1000"` + `group_add: ["${DOCKER_GID}"]`
- [ ] `volumes:` socket + bind **espelhado** da raiz de projetos (mesmo caminho dos dois lados)
- [ ] Volume nomeado em `/data` para `stacks.json` e `DOCKER_CONFIG`
- [ ] `environment: HOME=/home/wesley` — compose alvo que usa `~`/`${HOME}` resolve errado sem isso
- [ ] Label própria `com.dockerlocal.self=true`
- [ ] `.env.example` com `DOCKER_GID` e o comando para obtê-lo

### Auto-preservação

- [ ] Detectar o próprio container — label `com.dockerlocal.self`, `HOSTNAME`, ou `/proc/self/cgroup`
- [ ] `isSelf: true` no `ContainerSummary` e no `StackSummary`
- [ ] **Bloquear** stop/remove/restart no próprio container e `down` na própria stack, com mensagem explicando
- [ ] Bloquear remoção da própria imagem
- [ ] Front desabilita as ações e mostra badge "este app"

### CLI (`dockerlocal`) — estilo `kind`

A CLI do `kind` (`kind create cluster`, `kind delete cluster`, `kind get clusters`, `kind load ...`) é a referência: um binário único, subcomandos curtos e verbos, nada de decorar flags de `docker compose -f ... --profile ...`. A nossa cobre só o ciclo de vida do **próprio** container do DockerLocal, não dos containers gerenciados pela UI (esses continuam só pela web).

- [ ] Pacote `apps/cli` (ou `packages/cli`), publicado com `bin` no `package.json` — roda via `pnpm dlx dockerlocal` ou instalado global (`npm i -g`)
- [ ] `dockerlocal up` — gera/valida `.env` (`DOCKER_GID`, bind espelhado), `docker compose up -d`; falha cedo com a mesma mensagem clara da fase 0 se faltar `DOCKER_GID`
- [ ] `dockerlocal down` — `docker compose down`; `--volumes` remove o volume nomeado de `/data` (`stacks.json`, `DOCKER_CONFIG`)
- [ ] `dockerlocal start` / `dockerlocal stop` — start/stop do container existente sem recriar (equivalente a `docker start|stop`, não `compose up|down`)
- [ ] `dockerlocal restart`
- [ ] `dockerlocal status` — rodando/parado, porta publicada, versão da imagem, restart policy atual
- [ ] `dockerlocal logs [--follow]` — segue a saída do próprio container (não confundir com o SSE de logs da UI, que é para containers gerenciados)
- [ ] `dockerlocal config set restart-policy <always|unless-stopped|on-failure|no>` — reescreve `restart:` no compose do app (ou aplica via `docker update` para não exigir recriar) e persiste a escolha
- [ ] `dockerlocal config get` — mostra a config efetiva atual
- [ ] Flags globais estilo kind: `--name` (nome do container/projeto, default fixo), `--quiet`
- [ ] `dockerlocal --help` e `--version`
- [ ] Mensagens de erro reusam os checks da fase 0 (socket sem permissão, Docker não encontrado) — a CLI não deve reimplementar validação, só chamar o mesmo caminho que a API usa

### README

- [ ] Passo a passo: `getent group docker | cut -d: -f3` → `DOCKER_GID` no `.env`
- [ ] Explicar por que o bind é espelhado (e por que não montar `/`)
- [ ] Modo nativo (`pnpm dev`) vs container, e quando usar cada um
- [ ] Referência rápida da CLI (`dockerlocal up|down|start|stop|restart|status|logs|config`)

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
dockerlocal up                              # sobe o container, equivalente ao bloco acima
dockerlocal status                          # mostra "rodando", porta 127.0.0.1:5100, restart policy
dockerlocal config set restart-policy always
dockerlocal status                          # restart policy refletida sem precisar de `up` de novo
dockerlocal stop && dockerlocal status      # "parado", container preservado (não removido)
dockerlocal start                           # volta a rodar sem perder estado
dockerlocal down                            # remove o container; volume nomeado sobrevive sem --volumes
```

- `dockerlocal up` numa máquina sem `DOCKER_GID` no `.env` falha com a mesma mensagem clara da fase 0, não com erro cru do compose
- `dockerlocal config set restart-policy always` sobrevive a um reboot do host simulado (`systemctl restart docker` ou reinício da VM) — o container volta sozinho

## Arquivos previstos

```
Dockerfile · docker-compose.yml · .dockerignore · .env.example · README.md
apps/api/src/static/static.module.ts
apps/api/src/docker/self-detect.service.ts
apps/cli/                          (bin dockerlocal — up/down/start/stop/restart/status/logs/config)
```

## As três armadilhas

**1. Publicar porta em container fura o firewall.** `ports: ["5100:5100"]` expõe o app na LAN mesmo com UFW ativo — a regra do Docker vai na `DOCKER-USER`/nat e o firewall não a vê. Sempre `127.0.0.1:5100:5100`. Dado que o app tem controle total do daemon, isso seria root remoto sem autenticação.

**2. Auto-destruição.** Se o DockerLocal rodar como stack, ele aparece na própria lista, e um `down` o mata no meio do request — sem resposta, sem log, usuário sem entender o que houve. Daí o `isSelf`.

**3. `HOME` no bind espelhado.** Dentro do container o `HOME` do node é `/root` ou `/home/node`. Um compose alvo que use `~` ou `${HOME}` resolve para um caminho que não existe no host. `HOME=/home/wesley` no environment resolve o caso comum; `include:`/`extends:` apontando para fora da raiz espelhada continua quebrando — detecte no `compose config` e mostre aviso claro (fase 8).

## Por que espelhado

Quem monta os volumes das stacks alvo é o **daemon do host**. Se o app enviasse `/projects/app/src`, o host tentaria montar um caminho que não existe lá. Montando `/home/wesley/Documents/development` no mesmo caminho absoluto, `working_dir` e `config_files` das labels batem e todo bind relativo (`./src:/app/src`) resolve para um path real no host.

E não espelhe `/` "por garantia" — é o oposto de segurança.
