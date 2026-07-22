# syntax=docker/dockerfile:1

FROM oven/bun:1.3.14 AS deps
WORKDIR /app

COPY package.json bun.lock ./
COPY packages/client/package.json ./packages/client/
COPY packages/figma-plugin/package.json ./packages/figma-plugin/
COPY packages/server/package.json ./packages/server/
COPY packages/shared/package.json ./packages/shared/

# Only install workspaces needed to build the client (sanitize uses server).
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --production \
      --filter '@bundu/client' \
      --filter '@bundu/server' \
      --filter '@bundu/shared'

FROM deps AS build
ARG GAME_WS_URL=ws://localhost:7777
ENV GAME_WS_URL=$GAME_WS_URL
# Never ship client debug tools in the frontend image.
ENV BUNDU_DEBUG=0

COPY tsconfig.json build.ts index.html static-server.ts ./
COPY scripts ./scripts
COPY packages/shared ./packages/shared
COPY packages/server ./packages/server
COPY packages/client ./packages/client
COPY packs ./packs
COPY public ./public

# Reuse sanitized pack asset cache across builds when the BuildKit cache hits.
RUN --mount=type=cache,target=/app/.cache \
    bun run pack:gen && bun run ./build.ts

FROM oven/bun:1.3.14-slim AS runtime
WORKDIR /app

ENV PORT=3000
# Hot-reload / debug endpoints stay off in the shipped image.
ENV BUNDU_DEBUG=0

COPY --from=build /app/static-server.ts ./static-server.ts
COPY --from=build /app/public ./public

EXPOSE 3000
CMD ["bun", "static-server.ts"]
