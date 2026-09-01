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

# ---- buildx download ------------------------------------------------------
# docker/buildx-bin no Docker Hub só publica tags soltas por minor (v0.34,
# v0.35, v0.36 ...) que apontam pro HEAD de dev daquela linha — o binário
# reporta a versão como hash de commit, não semver, e isso quebra o gate de
# versão do `docker compose build` (exige buildx >= 0.17.0 parseável).
# Baixa o binário oficial do GitHub Release com checksum verificado — o
# único jeito de travar em v0.36.0 de verdade e reprodutível.
FROM debian:bookworm-slim AS buildx-download
ARG TARGETARCH
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*
RUN set -eu; \
    BUILDX_VERSION=0.36.0; \
    case "${TARGETARCH:-amd64}" in \
      amd64) BUILDX_SHA256=07823fdfcd82a41be90155a8b16876c1a780a6462de805a9f3f63b3119ccfb99 ;; \
      arm64) BUILDX_SHA256=70382de03915c07c488ae4ddc4f7e169ee978f953e754ecfce110ba017e0132b ;; \
      *) echo "arquitetura não suportada: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    curl -fsSL -o /tmp/docker-buildx \
      "https://github.com/docker/buildx/releases/download/v${BUILDX_VERSION}/buildx-v${BUILDX_VERSION}.linux-${TARGETARCH:-amd64}"; \
    echo "${BUILDX_SHA256}  /tmp/docker-buildx" | sha256sum -c -; \
    chmod +x /tmp/docker-buildx

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
COPY --from=buildx-download /tmp/docker-buildx /usr/local/libexec/docker/cli-plugins/docker-buildx

# node:24-bookworm-slim NÃO vem com ca-certificates — o Node tem sua própria
# lista de CAs embutida (por isso o resto da API funciona sem isso), mas o
# `docker`/`buildx` são binários Go que leem o trust store do SO. Sem isso,
# toda resolução de imagem TLS (`docker compose build` contra o Docker Hub)
# falha com "x509: certificate signed by unknown authority".
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

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
