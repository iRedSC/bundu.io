# syntax=docker/dockerfile:1

FROM oven/bun:1.3.14 AS deps
WORKDIR /app

COPY package.json bun.lock ./
COPY packages/client/package.json ./packages/client/
COPY packages/figma-squircle-merge/package.json ./packages/figma-squircle-merge/
COPY packages/figma-texture-export/package.json ./packages/figma-texture-export/
COPY packages/server/package.json ./packages/server/
COPY packages/shared/package.json ./packages/shared/

# Skip client/figma (and root devDependencies) for the server image.
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --production \
      --filter '@bundu/server' \
      --filter '@bundu/shared'

FROM oven/bun:1.3.14-slim AS runtime
WORKDIR /app

ENV WS_PORT=7777

COPY --from=deps /app/package.json /app/bun.lock ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/server ./packages/server
COPY --from=deps /app/packages/shared ./packages/shared

COPY packages/server ./packages/server
COPY packages/shared ./packages/shared
COPY scripts ./scripts
COPY packs ./packs
COPY --chown=bun:bun maps ./maps
COPY tsconfig.json ./

RUN --mount=type=cache,target=/app/.cache \
    bun run pack:gen

# BuildKit cache mounts are not persisted into the image. Recreate a writable
# runtime cache for startup pack compilation.
RUN mkdir -p /app/.cache && chown bun:bun /app/.cache

EXPOSE 7777
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
    CMD ["bun", "-e", "const r=await fetch('http://127.0.0.1:7777/readyz');if(!r.ok)process.exit(1)"]
USER bun
CMD ["bun", "run", "packages/server/src/index.ts"]
