# Deployment contract

The supported public topology is:

```text
Internet → TLS reverse proxy → frontend :3000
                           └→ game server :7777 (WebSocket + pack HTTP)
```

The proxy owns public TLS. Route the game and documentation hosts to the
frontend service, and route the public game WebSocket and `/packs/` paths to the
server. The server port should remain private when the proxy shares its network.

## Required configuration

- Build the frontend with `GAME_WS_URL` set to the browser-visible endpoint.
  Production deployments must use `wss://`.
- Set `DOCS_HOST` to the documentation host names accepted by the frontend.
- Set `DOCS_PUBLIC_ORIGIN` to the public HTTPS documentation origin.
- Forward the original `Host` header.
- Enable WebSocket upgrade forwarding and use an idle timeout longer than the
  expected game session.

Pack resources deliberately send `Access-Control-Allow-Origin: *` without
credentials. WebSocket Origin admission is a separate protocol concern and
must match the public game origins when that policy is enabled.

## Health and readiness

Both services expose:

- `/healthz`: the process can answer HTTP.
- `/readyz`: required startup resources are available.

The frontend readiness response checks the built game and documentation entry
points. The server only starts listening after configuration, map, and resource
packs have loaded, so its readiness endpoint also returns the active pack
fingerprint.

Compose waits for server readiness before starting the frontend and restarts
failed services unless they are explicitly stopped.

## Rollout and recovery

The frontend embeds `GAME_WS_URL` at build time, so changing the public endpoint
requires rebuilding it. Client/server content compatibility is enforced by the
resource-pack fingerprint. Roll out the server and matching frontend together;
retain the previous image pair for rollback.

Collect container stdout/stderr centrally. Alert on failed readiness checks,
restart loops, WebSocket disconnect rates, and resource-pack mismatch responses.
