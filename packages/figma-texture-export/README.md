# Bundu Texture Export

Exports Figma frames into `packs/<namespace>/defs/<namespace>/client/textures/` via a local companion server.

## Layout convention

1. Draw a rectangle, name it `@item/equipment`, and **lock** it.
2. Place texture frames inside that rect (centers must fall inside the zone).
3. Name each frame like `stone_helmet`.

Preview maps that to:

```text
packs/bundu/defs/bundu/client/textures/item/equipment/stone_helmet.svg
```

Nested zones: the **smallest** containing `@…` rect wins. Push **replaces** existing files after you confirm the dry-run list.

## Use

1. Start the companion from the repo root:

```bash
bun run figma:textures
```

2. Build the plugin:

```bash
bun run --cwd packages/figma-texture-export build
```

3. In Figma desktop: **Plugins → Development → Import plugin from manifest…** → `packages/figma-texture-export/manifest.json`.
4. Run **Bundu Texture Export**, set namespace (default `bundu`), **Preview**, then **Push**.

The companion binds to `127.0.0.1:4177`; the plugin reaches it via `http://localhost:4177` (Figma only allows `localhost` in the manifest). CORS is limited to the Figma plugin sandbox (`Origin: null`).
