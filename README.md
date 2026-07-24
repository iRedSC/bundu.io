# bundu.io

Bun monorepo: Pixi client, WebSocket game server, shared package.

## Install

```bash
bun install
```

## Local

```bash
bun run dev
```

Builds the client, starts the game server (WS `:7777`) and static host (`:3000`), and rebuilds the client when sources change. Open http://localhost:3000/site/

To run either process alone:

```bash
bun run server   # WS :7777
bun run client   # build + static host :3000
```

Docs are authored under [`docs/`](./docs/). Build output lands in `public/docs/` and is served as the **site root** on `wiki.bundu.io` (root paths — not `/docs/...` links):

```bash
bun run docs:dev       # VitePress dev server
bun run docs:build     # → public/docs/
bun run docs:preview   # preview the production build at /
```

## Containers

```bash
GAME_WS_URL=ws://localhost:7777 docker compose up --build
```

Compose publishes ports `3000` and `7777` and requires an explicit browser-facing
WebSocket URL. The local value above is correct because the browser and containers
share the same machine. Remote deployments must use the public TLS endpoint, for
example `GAME_WS_URL=wss://game.example.com`.

| Service   | Internal port | Image build file        |
|-----------|------|-------------------------|
| frontend  | 3000 | `containers/frontend/Dockerfile` |
| server    | 7777 | `containers/server/Dockerfile`   |

The frontend image builds the game client (`/site/`) and VitePress docs (`public/docs/`). Point `wiki.bundu.io` at the same frontend service; the static server serves docs when `Host` matches `DOCS_HOST`. Requests to `/docs` on the game host redirect to `DOCS_PUBLIC_ORIGIN`.

### Environment

| Variable       | Service            | Default                 |
|----------------|--------------------|-------------------------|
| `PORT`         | frontend runtime   | `3000`                  |
| `WS_PORT`      | server runtime     | `7777`                  |
| `GAME_WS_URL`  | frontend **build** | `ws://localhost:7777`   |
| `DOCS_HOST`    | frontend runtime   | `wiki.bundu.io`         |
| `DOCS_PUBLIC_ORIGIN` | frontend runtime | `https://wiki.bundu.io` |

Override `FRONTEND_PORT` or `SERVER_PORT` to change the published host ports. For
a non-local deploy, rebuild frontend with the public WebSocket URL:

```bash
GAME_WS_URL=wss://game.example.com docker compose build frontend
```

Both services expose `/healthz` for liveness and `/readyz` for readiness.
Deployment topology and proxy requirements are documented in
[`docs/ops/deployment.md`](./docs/ops/deployment.md).

## Scripts

| Script            | Purpose                                      |
|-------------------|----------------------------------------------|
| `bun run dev`     | Server + client together (rebuild on change) |
| `bun run server`  | Game WebSocket server                        |
| `bun run client`  | Build + `serve-frontend` (dev)               |
| `bun run build`   | Production client bundle → `public/site/`    |
| `bun run build:frontend` | Client + docs → `public/site/` + `public/docs/` |
| `bun run serve-frontend`  | Hot static server (`static-server.ts`) |
| `bun run serve-frontend:prod` | Static server without `--hot`      |
| `bun run typecheck`      | `tsc --noEmit`                        |
| `bun run lint`           | Biome lint (incl. package boundaries) |
| `bun test`               | Unit tests                            |
| `bun run docs:dev`       | VitePress docs site (local)           |
| `bun run docs:build`     | Build docs → `public/docs/` (root `base`) |
| `bun run docs:preview`   | Preview built docs at `/`             |

Ops notes are in `docs/ops/` and are not part of the site.

This project uses [Bun](https://bun.com) v1.3.14.
