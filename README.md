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

Isso sobe a API (`apps/api`, porta 5100) e o frontend (`apps/web`, porta 5173) em paralelo.

Abra `http://localhost:5173` — a StatusBar mostra a versão do Docker conectado.

## Verificando a API isoladamente

```bash
curl -s localhost:5100/api/system/ping
# {"ok":true,"apiVersion":"1.55","engineVersion":"29.7.1"}

curl -s 'localhost:5100/api/containers?all=true' | jq
```

## Estrutura

- `apps/api` — NestJS (Express), fala com o daemon via `dockerode` e via CLI (`spawn`)
- `apps/web` — Vue 3 + Vite + Pinia + Tailwind 4
- `packages/shared` — tipos compartilhados entre os dois, sem etapa de build

## Documentação

- `docs/arquitetura.md` — estrutura de módulos
- `docs/api-contrato.md` — endpoints REST e canais SSE
- `docs/decisoes.md` — ADRs, versões travadas
- `docs/backlog/` — fases e tarefas
