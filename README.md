# bundu.io

Bun monorepo: Pixi client, WebSocket game server, shared package.

## Install

```bash
bun install
```

## Local (two processes)

```bash
# Terminal 1 — game server (WS :7777)
bun run server

# Terminal 2 — build client + static host (:3000)
bun run client
```

Open http://localhost:3000/site/

## Containers

```bash
docker compose up --build
```

| Service   | Port | Image build file        |
|-----------|------|-------------------------|
| frontend  | 3000 | `Dockerfile.frontend`   |
| server    | 7777 | `Dockerfile.server`     |

### Environment

| Variable       | Service            | Default                 |
|----------------|--------------------|-------------------------|
| `PORT`         | frontend runtime   | `3000`                  |
| `WS_PORT`      | server runtime     | `7777`                  |
| `GAME_WS_URL`  | frontend **build** | `ws://localhost:7777`   |

For a non-local deploy, rebuild frontend with the public WebSocket URL:

```bash
GAME_WS_URL=wss://game.example.com docker compose build frontend
```

`docker-compose.yml` includes commented stubs for future `api` and `db` services.

## Scripts

| Script            | Purpose                                      |
|-------------------|----------------------------------------------|
| `bun run server`  | Game WebSocket server                        |
| `bun run client`  | Build + hot static server (dev)              |
| `bun run build`   | Production client bundle → `public/site/`    |
| `bun run start:frontend` | Static server without `--hot`         |
| `bun run start:server`   | Same as `server`                      |
| `bun run typecheck`      | `tsc --noEmit`                        |
| `bun test`               | Unit tests                            |

This project uses [Bun](https://bun.com) v1.3.0.
