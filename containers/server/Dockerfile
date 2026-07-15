# syntax=docker/dockerfile:1

FROM oven/bun:1.3.14 AS deps
WORKDIR /app

COPY package.json bun.lock ./
COPY packages/client/package.json ./packages/client/
COPY packages/figma-plugin/package.json ./packages/figma-plugin/
COPY packages/server/package.json ./packages/server/
COPY packages/shared/package.json ./packages/shared/

RUN bun install --frozen-lockfile

FROM oven/bun:1.3.14-slim AS runtime
WORKDIR /app

ENV WS_PORT=7777

COPY --from=deps /app/package.json /app/bun.lock ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/client/package.json ./packages/client/
COPY --from=deps /app/packages/server/package.json ./packages/server/
COPY --from=deps /app/packages/shared/package.json ./packages/shared/

COPY packages/server ./packages/server
COPY packages/shared ./packages/shared
COPY --from=deps /app/packages/server/node_modules ./packages/server/node_modules
COPY tsconfig.json ./

EXPOSE 7777
CMD ["bun", "run", "packages/server/src/index.ts"]
