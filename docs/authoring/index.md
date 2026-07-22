# Authoring

How content enters the game. Keep this section short; deep field reference stays in the repo guide.

## Mental model

| Side | What | Where |
|---|---|---|
| Display (first `---` doc) | Models, poses, sprites | → generated `assets/` |
| Data (second `---` doc) | Gameplay | → generated `data/` |
| Recipes / loot / tags | Data-only files | `defs/.../recipes/`, `loot_tables/`, `tags/` |
| Textures | Manual | `defs/<ns>/client/textures/` |

Path owns identity. Don’t write `id:` unless it must differ from the file path.

## Commands

```bash
bun run pack:gen          # defs/ → .generated/packs/*/{data,assets}
bun run validate:packs    # regenerate, then validate the runtime mirror
```

## Smallest item

```yaml
# items/pinecone.yml — material with no special behavior
texture: bundu/item/material/pinecone.svg
---
{}
```

## Next

- [Packs](./packs) — discovery, overlays, `defs/` layout
- Full field guide: [`packs/AUTHORING.md`](https://github.com/iRedSC/bundu.io/blob/main/packs/AUTHORING.md)
