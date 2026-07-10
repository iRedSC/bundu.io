# Personal Preferences

## Typescript
- Never use `any` unless 100% necessary or specifically requested.

## Commands
- Don't run dev server commands (e.g. `bun run dev`) - assume it's already running.
- Don't run build commands unless specifically told to.
- Focus on checking commands like `bun run typecheck`, `bun run lint`, etc.

## Package Managers
- Use bun
- Never use npm or yarn

## Code Style
- Always strive for concise, dead simple code.
- Use architecture to your advantage, make illegal states impossible.
- If a problem can be solved a simpler way, propose to.

## General Preferences
- If asked to do too much work at once, stop and state that clearly.

## Subagents
- Please use Grok 4.5 High for all subagent work.

## Tests
- NEVER modify tests without asking. Give a debrief of why they need changed, and only change them on approval.

## Cursor Cloud specific instructions

**bundu.io** is a Bun monorepo (client + WebSocket server + shared). No database or external services are required.

- **Runtime:** Bun **v1.3.0** (see CI). If `bun` is missing, install with `curl -fsSL https://bun.sh/install | bash -s "bun-v1.3.0"`; binary is at `~/.bun/bin/bun`.
- **Dev stack:** `bun run dev` builds the client and runs the game server (`ws://localhost:7777`) plus the static frontend (`http://localhost:3000/site/`). For this repo's normal agent workflow, assume the dev server is already running — do not start it unless explicitly asked.
- **Individual processes:** `bun run server` (WS only), `bun run client` (build + static host).
- **Checks:** `bun run typecheck`, `bun run lint`, `bun test` (89 unit tests). CI also runs `bun run build` and `bun run check-prod-debug`; skip build unless requested (see Commands above).
- **Docker alternative:** `docker compose up --build` exposes the same ports (3000, 7777).