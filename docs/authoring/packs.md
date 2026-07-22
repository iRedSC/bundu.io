# Packs

`bundu` is the required base pack. Directories under `packs/` are authoring sources; `bun run pack:gen` mirrors runnable packs into `.generated/packs/`. The server loads that generated root.

## Pack manifest

```yaml
id: example
format: 1
version: 0.1.0
depends: [bundu]
```

Later packs override complete documents and individual registry entries. Set `BUNDU_PACK_ROOT` to load packs from another directory.

## Combined definitions

Paired content uses a YAML document separator. First doc = display, second = data:

```yaml
# defs/bundu/items/wood_sword.yml
extends: item_type:bundu:sword
texture: bundu/item/tool/wood_sword.svg
---
type: bundu:sword
level: 1
whenMainHand:
  "@s":
    attributes:
      attack.damage: { op: add, value: 13 }
```

```yaml
# defs/bundu/entities/bear.yml
extends: model:bundu:actors/animal
parts:
  body:
    sprite: bundu/entity/animal/bear/bear.svg
    spriteScale: 2.5
---
health: 350
behavior: hostile
corpse: bear_dead
```

## Path → emit (common)

| `defs/...` | display → | data → |
|---|---|---|
| `items/X.yml` | `models/items/X.yml` | `items/X.yml` |
| `entities/X.yml` | `models/actors/X.yml` | `entities/X.yml` |
| `buildings/.../X.yml` | matching model | `buildings/X.yml` |
| `recipes/**`, `loot_tables/**` | — | same under `data/` |

## Deeper reference

- Pack discovery & overlays: [`packs/README.md`](https://github.com/iRedSC/bundu.io/blob/main/packs/README.md)
- Per-type authoring: [`packs/AUTHORING.md`](https://github.com/iRedSC/bundu.io/blob/main/packs/AUTHORING.md)
