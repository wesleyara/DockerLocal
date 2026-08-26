# syntax=docker/dockerfile:1

# ---- deps + build -----------------------------------------------------
FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter web build && pnpm --filter api build

# ---- runtime ------------------------------------------------------------
FROM node:24-bookworm-slim AS runtime
WORKDIR /app

# CLI + plugins de imagens oficiais — a Engine API não tem conceito de
# "stack" nem expõe BuildKit, então compose/build vão por spawn do CLI
# (skill compose-cli). O daemon em si NUNCA roda aqui: só o socket montado.
# Tags travadas em docs/decisoes.md (Compose v5.4.0, Buildx v0.36.0) — "v5"
# e "latest" bare não existem no registry, então nada de atalho aqui.
COPY --from=docker:29-cli               /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker/compose-bin:v5.4.0   /docker-compose  /usr/local/libexec/docker/cli-plugins/docker-compose
COPY --from=docker/buildx-bin:v0.36     /buildx          /usr/local/libexec/docker/cli-plugins/docker-buildx
RUN docker compose version && docker buildx version

ENV NODE_ENV=production
ENV DOCKER_CONFIG=/data/.docker
# Ver env.schema.ts: dentro de container o processo PRECISA escutar em
# 0.0.0.0 pro `docker run -p`/compose conseguirem encaminhar tráfego — a
# segurança vem do docker-compose.yml publicar só em 127.0.0.1 no host.
# NUNCA sete essas duas fora deste Dockerfile/compose.
ENV HOST=0.0.0.0
ENV DOCKER_LOCAL_CONTAINER=1

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/api/package.json ./apps/api/package.json

RUN mkdir -p /data && chown node:node /data
USER node

EXPOSE 5100

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5100)+'/api/system/ping').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/api/dist/apps/api/src/main.js"]
