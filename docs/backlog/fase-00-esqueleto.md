# Fase 00 — Esqueleto ponta a ponta

## Objetivo

Abrir `localhost:5173` e ver **"Docker 29.7.1 conectado"**.

Parece pouco, mas prova de uma vez: socket acessível, permissão do grupo, workspace resolvendo, tipos compartilhados, proxy do Vite e o ciclo REST inteiro. Todo problema de encanamento aparece aqui, quando ainda é barato.

## Tarefas

- [ ] Remover a imagem dangling do levantamento: `docker rmi d6d1d7211054`
- [ ] `pnpm-workspace.yaml` com `packages: ["apps/*", "packages/*"]`
- [ ] `package.json` raiz com scripts `dev` (api + web em paralelo), `build`, `lint`
- [ ] `packages/shared` — `package.json` com `"main": "./src/index.ts"`, sem build; `src/index.ts` exportando de `container.types.ts` (só `ContainerSummary` por ora)
- [ ] `apps/api` via Nest CLI; `tsconfig.json` com path `@dockerlocal/shared` → `../../packages/shared/src`
- [ ] `config/env.schema.ts` com zod: `PORT=5100`, `HOST=127.0.0.1`, `DOCKER_SOCKET=/var/run/docker.sock`, `FS_ROOTS`, `AUTH_TOKEN?`, `ALLOWED_ORIGINS`
- [ ] `.env.example` documentando cada variável, com o comando do `DOCKER_GID`
- [ ] `DockerModule` `@Global()` — `docker.provider.ts` com factory `new Docker({ socketPath })` sob o token `DOCKER_CLIENT`
- [ ] Check de permissão no `onModuleInit`: `fs.access(socket, R_OK|W_OK)` → em falha, mensagem *"sem permissão no socket — verifique DOCKER_GID"*, não um `EACCES` cru cinco camadas abaixo
- [ ] `docker.service.ts` com `ping()`, `version()`, `info()`
- [ ] `GET /api/system/ping` → `{ ok, apiVersion, engineVersion }`
- [ ] `main.ts` com prefixo global `/api` e `app.listen(port, host)`
- [ ] **Fail-safe:** se `HOST=0.0.0.0` sem `AUTH_TOKEN`, recusar subir com mensagem explícita (ADR-07)
- [ ] `apps/web` via Vite (`vue-ts`); Tailwind 4; `vue-router` com as rotas vazias das 4 abas
- [ ] `vite.config.ts` com proxy `/api` → `http://127.0.0.1:5100`
- [ ] `api/http.ts` — baseURL, header `X-DockerLocal: 1` em não-GET, unwrap do erro do Nest
- [ ] `AppShell.vue` + `SideNav.vue` + `StatusBar.vue`; a StatusBar consome `/api/system/ping`
- [ ] `.gitignore`, `.dockerignore`, `README.md` com o passo a passo de subir

## Critério de aceite

```bash
pnpm dev
curl -s localhost:5100/api/system/ping
# {"ok":true,"apiVersion":"1.55","engineVersion":"29.7.1"}
```

- `localhost:5173` mostra "Docker 29.7.1 conectado" na StatusBar
- Renomear um campo em `packages/shared` quebra o build **dos dois** apps
- `HOST=0.0.0.0 pnpm --filter api dev` sem `AUTH_TOKEN` → recusa subir com mensagem clara
- `docker images -f dangling=true` não lista mais `d6d1d7211054`

## Arquivos previstos

```
pnpm-workspace.yaml · package.json · .env.example · .gitignore · README.md
packages/shared/{package.json,src/index.ts,src/container.types.ts}
apps/api/src/{main.ts,app.module.ts}
apps/api/src/config/{configuration.ts,env.schema.ts}
apps/api/src/docker/{docker.module.ts,docker.provider.ts,docker.service.ts}
apps/api/src/system/{system.module.ts,system.controller.ts}
apps/web/{vite.config.ts,index.html,src/main.ts,src/App.vue}
apps/web/src/api/http.ts
apps/web/src/components/layout/{AppShell.vue,SideNav.vue,StatusBar.vue}
apps/web/src/router/index.ts
```

## Notas

O spike do builder clássico **não é necessário** — já foi feito no levantamento. O legacy builder funciona no Docker 29.7.1 mas está deprecado; por isso `docker build` via CLI é o padrão e `dockerode.buildImage()` é fallback (ADR-03).

Não instale `compression` no Express. Ele quebra SSE na fase 2 e o sintoma é confuso (logs chegando em rajadas).
