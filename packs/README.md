# Packs

`bundu` is the required base pack. Every directory in this folder with a
`pack.yml` is discovered by the server. Dependencies load first; later packs
override complete documents and individual entries in record resources.

```yaml
id: example
format: 1
version: 0.1.0
depends: [bundu]
```

To replace one Bundu entity without copying unrelated entity entries, create:

```text
packs/example/data/bundu/entities.yml
```

```yaml
bear:
  health: 500
  behavior: hostile
  # Include the rest of the bear definition here.
```

Record resources (`entities`, `resources`, `buildings`, recipes, and item
files) overlay by top-level key; the overriding entry replaces that entry in
full. Single-document resources such as `gameplay` replace the complete
document. Run `bun run validate:packs` after editing.

Set `BUNDU_PACK_ROOT` to load packs from a different directory.

## Resources

Resource files use namespaced logical paths. For example:

```text
packs/bundu/assets/bundu/textures/structure/wall/wood_wall.png
packs/bundu/assets/bundu/textures/decoration/snow/snow_blob_1.svg
packs/bundu/assets/bundu/visuals/items/items.yml
packs/bundu/assets/bundu/lang/en.yml
```

Definitions refer to textures as `bundu/structure/wall/wood_wall.png`. A later
pack can replace that asset by providing the same namespace and relative path.
Visual definitions overlay by definition ID in pack order.

The game server exposes the ordered pack stack at `/packs/manifest.json`.
Clients download and SHA-256-check its effective visuals and textures before
connecting, then include the negotiated fingerprint in the WebSocket URL. The
server rejects clients whose fingerprint does not match its current stack.
