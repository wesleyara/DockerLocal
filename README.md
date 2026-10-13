# DockerLocal

Um "Docker Desktop" próprio, web, rodando em `localhost`.

## Subindo o projeto

```bash
cp .env.example .env
# ajuste DOCKER_GID em .env com:
getent group docker | cut -d: -f3

pnpm install
pnpm dev
```

Isso sobe a API (`apps/api`, porta 5100) e o frontend (`apps/web`, porta 5551) em paralelo.

Abra `http://localhost:5551` — a StatusBar mostra a versão do Docker conectado.

## Verificando a API isoladamente

```bash
curl -s localhost:5100/api/system/ping
# {"ok":true,"apiVersion":"1.55","engineVersion":"29.7.1"}

curl -s 'localhost:5100/api/containers?all=true' | jq
```

## Rodando empacotado (container)

O DockerLocal também roda como o próprio container que ele gerencia — front e API na mesma origem, sem depender de `pnpm dev`.

```bash
cp .env.example .env
echo "DOCKER_GID=$(getent group docker | cut -d: -f3)" >> .env
# ajuste PROJECTS_ROOT pra raiz onde ficam os projetos que você quer abrir
# pelo file browser/stacks — precisa ser o MESMO caminho absoluto no host
# e dentro do container (bind espelhado), então normalmente é igual a FS_ROOTS

docker compose up -d
curl -s localhost:5100/api/system/ping
```

**Por que espelhado:** quem monta os volumes das stacks que você abre pela UI é o daemon do *host*, não o container do app. Se dentro do container o path fosse diferente do host, todo `./src:/app/src` de um compose alvo apontaria pra um lugar que não existe no host. Montando `PROJECTS_ROOT` no mesmo caminho absoluto dos dois lados, `working_dir` e binds relativos resolvem certo — inclusive pra `docker build` e `docker compose` disparados de dentro do container.

**Nunca publique a porta sem o prefixo `127.0.0.1:`.** `docker-compose.yml` já vem assim (`127.0.0.1:${PORT:-5100}:5100`) — sem o prefixo, a porta abre na LAN por baixo do UFW (a regra do Docker vai direto na NAT), e este app tem controle total do daemon: seria root remoto sem autenticação.

O container empacotado se detecta na própria lista (label `com.dockerlocal.self`) e aparece com um badge "este app" — stop/restart/remove nele, e down/stop/restart na própria stack, voltam **403** em vez de derrubar o app no meio do request.

Modo nativo (`pnpm dev`) é melhor pra desenvolver o próprio DockerLocal (hot reload, debug); modo container é o jeito de rodar o app no dia a dia, isolado com sua própria imagem/versão.

## Binário standalone (sem Docker, sem Node instalado)

Terceira forma de rodar, além de `pnpm dev` e do container: um executável único por plataforma, API + front embutidos, via [Node SEA](https://nodejs.org/api/single-executable-applications.html). Quem só quer *usar* o app não precisa ter Node instalado — só Docker (pra ele gerenciar), que já é pré-requisito do app existir.

```bash
pnpm build:binary                       # builda linux-x64 e win-x64 em dist-bin/
pnpm build:binary --target=linux-x64    # só um alvo

cp .env.example .env                    # ao lado do binário, ou no cwd de onde ele roda
./dist-bin/dockerlocal-linux-x64
curl -s localhost:5100/api/system/ping
```

Builda em `~/.cache` os binários oficiais do Node baixados de nodejs.org (versão travada em `docs/decisoes.md`) — não depende do Node instalado na máquina que builda, só do próprio Node pra RODAR o script de build. Detalhes, limitações e o porquê de cada peça em [`docs/decisoes.md`](docs/decisoes.md) (ADR-11).

**Windows é cross-build, não testado em execução real** — este projeto builda em Linux; o `.exe` gerado nunca roda de fato aqui, só é confirmado que o arquivo sai íntegro. Valide num Windows de verdade antes de distribuir. A assinatura Authenticode do `node.exe` oficial fica invalidada pela injeção (esperado — [ver a documentação oficial do Node sobre isso](https://nodejs.org/api/single-executable-applications.html#platform-support)), o que pode disparar aviso do SmartScreen no primeiro run.

Qual modo usar: `pnpm dev` pra desenvolver o próprio DockerLocal (hot reload); container quando você já vive em Docker e quer isolamento/restart policy de graça; binário standalone quando quer o mínimo de fricção possível pra só rodar o app.

## Estrutura

- `apps/api` — NestJS (Express), fala com o daemon via `dockerode` e via CLI (`spawn`)
- `apps/web` — Vue 3 + Vite + Pinia + Tailwind 4
- `packages/shared` — tipos compartilhados entre os dois, sem etapa de build
- `scripts/build-binary.mjs` — gera o binário standalone (`pnpm build:binary`)

## Documentação

- `docs/arquitetura.md` — estrutura de módulos
- `docs/api-contrato.md` — endpoints REST e canais SSE
- `docs/decisoes.md` — ADRs, versões travadas
- `docs/backlog/` — fases e tarefas
