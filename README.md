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

## Containers

```bash
docker compose up --build
```

| Service   | Internal port | Image build file        |
|-----------|------|-------------------------|
| frontend  | 3000 | `containers/frontend/Dockerfile` |
| server    | 7777 | `containers/server/Dockerfile`   |

### Environment

| Variable       | Service            | Default                 |
|----------------|--------------------|-------------------------|
| `PORT`         | frontend runtime   | `3000`                  |
| `WS_PORT`      | server runtime     | `7777`                  |
| `GAME_WS_URL`  | frontend **build** | `ws://localhost:7777`   |

Compose publishes fixed host ports `3000` and `7777` to match the default `GAME_WS_URL`. For a non-local deploy, rebuild frontend with the public WebSocket URL:

```bash
GAME_WS_URL=wss://game.example.com docker compose build frontend
```

## Scripts

| Script            | Purpose                                      |
|-------------------|----------------------------------------------|
| `bun run dev`     | Server + client together (rebuild on change) |
| `bun run server`  | Game WebSocket server                        |
| `bun run client`  | Build + `serve-frontend` (dev)               |
| `bun run build`   | Production client bundle → `public/site/`    |
| `bun run serve-frontend`  | Hot static server (`static-server.ts`) |
| `bun run serve-frontend:prod` | Static server without `--hot`      |
| `bun run typecheck`      | `tsc --noEmit`                        |
| `bun run lint`           | Biome lint (incl. package boundaries) |
| `bun test`               | Unit tests                            |
| `bun run docs:dev`       | VitePress docs site (local)           |
| `bun run docs:build`     | Build docs → `docs/.vitepress/dist`   |

Docs live under [`docs/`](./docs/) (gameplay + pack authoring). Ops notes are in `docs/ops/` and are not part of the site.

This project uses [Bun](https://bun.com) v1.3.14.
