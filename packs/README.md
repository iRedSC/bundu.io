# Packs

`bundu` is the required base pack. Every directory in this folder with a
`pack.yml` is discovered by the server. Dependencies load first; later packs
override complete documents and individual registry entries.

```yaml
id: example
format: 1
version: 0.1.0
depends: [bundu]
```

Set `BUNDU_PACK_ROOT` to load packs from another directory. Run
`bun run validate:packs` after editing a pack.

## Authoring with `defs/`

Pack YAML is authored under `defs/<namespace>/`. `bun run pack:gen` splits those
files into the runtime trees the server already loads:

- `data/<namespace>/` — server gameplay
- `assets/<namespace>/` — client models, ground models, lang, client gameplay

Textures stay as real files under `assets/<namespace>/textures/` (not generated).
`validate:packs` runs `pack:gen --check` first so generated YAML cannot drift.

### Combined definitions

Paired content uses a YAML document separator. First doc = display (assets),
second doc = data (server):

```yaml
# defs/bundu/items/pinecone.yml
id: item/pinecone
extends: item/type/none
texture: bundu/item/material/pinecone.svg

---
{}
```

```yaml
# defs/bundu/entities/bear.yml
id: bear
extends: animal
parts:
  body:
    sprite: bundu/entity/animal/bear/bear.svg
    spriteScale: 2.5

---
health: 350
behavior: hostile
corpse: bear_dead
```

Path → emit mapping:

| `defs/...` | display → | data → |
|---|---|---|
| `items/X.yml` | `assets/.../models/items/X.yml` | `data/.../items/X.yml` |
| `entities/X.yml` | `models/actors/X.yml` | `entities/X.yml` |
| `decorations/X.yml` | `models/decorations/X.yml` | `decorations/X.yml` |
| `resources/X.yml` | `models/resources/X.yml` | `resources/X.yml` |
| `buildings/walls/X.yml` | `models/walls/X.yml` | `buildings/X.yml` |
| `buildings/doors/X.yml` | `models/doors/X.yml` | `buildings/X.yml` |
| `buildings/structures/X.yml` | `models/structures/X.yml` | `buildings/X.yml` |
| `ground_types/X.yml` | `ground_models/X.yml` | `ground_types/X.yml` |
| `models/**` | `models/**` (display-only) | — |
| `recipes/**`, `loot_tables/**`, `tags/**` | — | same path under `data/` |
| `client/**` | copied into `assets/` | — |

Single-doc files in a paired registry folder are data-only. Single-doc files under
`models/` or `client/` are assets-only.

When the model path is not the default for that registry, add a directive:

```yaml
# @pack-gen model=models/nature/tree.yml
id: forest_tree
# ...

---
score: 5
loot_table: forest_tree
```

Shared abstracts stay under `defs/.../models/` and are referenced with `extends`
from display halves (same as today’s model inheritance).

## Gameplay registries

Runtime paths below are under `data/` (generated from `defs/`). Gameplay
definitions use canonical `namespace:path` IDs. The server currently loads these
registries independently:

- `item`
- `structure`
- `resource`
- `entity_type`
- `ground_type`
- `decoration`
- `recipe`
- `loot_table`

Registry entries are independent files whose relative filename becomes the path:

```text
data/bundu/entities/bear.yml              -> bundu:bear
data/bundu/resources/pine_tree.yml        -> bundu:pine_tree
data/bundu/buildings/wood_wall.yml        -> bundu:wood_wall
data/bundu/items/wood_sword.yml           -> bundu:wood_sword
data/bundu/ground_types/grass.yml         -> bundu:grass
# ground_type fields: model (client ground-visual id), optional overheat,
# plus optional whenOccupied effect contexts.
# Visuals (color/kind/textures) live in assets/<ns>/ground_models/<model>.yml
data/bundu/decorations/beach.yml          -> bundu:beach
data/bundu/recipes/wood_wall.yml          -> bundu:wood_wall
data/bundu/loot_tables/bear_dead.yml      -> bundu:bear_dead
```

Shared item templates live in the single document `data/<namespace>/item_types.yml`
(not a registry). Each item sets `type: sword` (etc.) to merge those defaults.

Bare entry references resolve relative to the definition's namespace. Use an
explicit ID to cross namespaces:

```yaml
corpse: bundu:bear_dead
```

Registry IDs are separate. `item:bundu:wood_wall` and
`structure:bundu:wood_wall` are distinct entries even when they share a resource
location. Cross-registry relationships must be explicit—for example, a
placeable item uses `places` to reference its structure.

Definitions overlay by canonical ID. A later definition replaces the complete
earlier definition rather than deep-merging it. Single documents, including
`gameplay.yml` and `item_types.yml`, replace the complete document.

## Typed tags

Tags group entries in one registry and are referenced as `#namespace:path`.
Place them under `data/<namespace>/tags/<registry>/`:

```text
data/bundu/tags/structure/walls.yml -> #bundu:walls
```

```yaml
values:
    - wood_wall
    - stone_wall
    - "#example:extra_walls"
```

Dependent packs append values by default. Set `replace: true` to replace the
previous tag. Tags may include tags from the same registry; missing members,
wrong-registry use, and cycles fail pack validation. Singular references such
as `corpse` reject tags, while set-valued fields such as entity `aggroAt` and
structure placement `ground` accept entries and tags.

## Entities

Entity definitions live under `data/<namespace>/entities/<id>.yml`. Behavior
values: `hostile` attacks on sight, `neutral` retaliates, `passive` flees when
hit, `scared` flees on sight. Useful fields:

- `scale` — size in tiles (`1` → diameter = 1 tile; default `1`)
- `hasHome` — idle roam alternates homeward + wander sessions when true
- `attack_reach` — seed for `attack.reach`; effective reach adds collision radius
- `aggroSwitch` — `never` | `onHit` | `random` retargeting when others interact
- `aggroLevel` — `high` | `medium` | `low` lock-on strength
- `aggroAt` — structures (entries or tags) to attack when no player target exists

## Recipes

Recipes have identities independent from their result items:

```yaml
result:
    item: wood_wall
    amount: 1
duration: 1000
score: 0
ingredients:
    wood: 10
requirements:
    - near_crafting_table
```

The client crafts by recipe ID, so multiple recipes may produce the same item.
Ingredients and results are typed item references. Requirements remain crafting
conditions, not registry tags, and are checked authoritatively by the server.

## Loot tables and resource quantity

Resources own finite quantity, regeneration, decay, tool rules, and depletion:

```yaml
bear_dead:
    quantity: 4
    loot_table: bear_dead
    destroy_on_empty: true
```

Loot tables describe what one harvested quantity unit produces. Two modes are
supported.

A fixed set is a finite multiset evaluated reproducibly from the resource seed
and harvest hit number. Hits beyond the set return no items; they still consume
resource quantity.

```yaml
type: fixed
entries:
    - item: meat
      count: 3
    - item: bear_fur
      count: 1
```

A pool table supports weighted entries, multiple rolls, and inclusive count
ranges:

```yaml
type: pool
pools:
    - rolls: 1
      entries:
          - item: meat
            weight: 3
            count: { min: 1, max: 2 }
          - item: bear_fur
            weight: 1
            count: 1
```

A multi-stack result is inserted atomically. If it cannot fully fit, the
resource quantity and harvest hit number do not advance.

## Assets

Model / ground-model / lang / client gameplay YAML is generated from `defs/`
into `assets/`. Textures are authored directly under `assets/`. Asset files use
namespaced logical paths:

```text
assets/bundu/textures/structure/wall/wood_wall.png
assets/bundu/models/items/wood_sword.yml
assets/bundu/models/items/type/sword.yml
assets/bundu/models/decorations/beach.yml
assets/bundu/lang/en.yml
assets/bundu/gameplay.yml
assets/bundu/ground_models/grass.yml
assets/bundu/ground_models/ocean.yml
```

### Ground models

Client ground visuals (not entity `ModelDef`s) live under
`assets/<namespace>/ground_models/<id>.yml`. `ground_type.model` must reference
one of these ids. Kinds:

```yaml
# solid fill + land↔land seam bake
kind: solid
color: "#2a462b"
# optional procedural texture (client bake; follows organic seams)
# fill: sand_bands | forest_blobs | solid_blobs

# optional move FX (solid only)
footsteps: true            # surface toggle — print params live on actor models
trail:                     # debris tinted from `color`, randomly jittered
    amount: [2, 4]         # particle count per burst
    speed: [40, 110]
    lifetime: [280, 520]
    size: [3, 7]
    end_size: 1
    spread: 1.1            # radians
    friction: 3.5
    gravity: 60
    color_jitter: 0.18     # 0..1 darken/lighten
    spacing: 14            # world px between bursts

# ocean FX + nearshore bake (textures sanitized like entity models)
kind: ocean
color: "#1a5f8a"
# optional — tiles of ocean→land color blend (default 12). Pond uses 2.
fade_tiles: 12
# optional — overrides gameplay.yml caustic tints for this model only
caustic_tint:
    a: "#366888"
    b: "#8cc3e8"
textures:
    caustics: bundu/effect/ocean_caustics.jpg
    displace: bundu/effect/ocean_displace.png
    ripple_idle: bundu/effect/ocean_ripple.png
    ripple_move: bundu/effect/ocean_ripple_move.png
    foam: bundu/effect/ocean_foam.svg
    sparkle: bundu/effect/ocean_sparkle.svg
```

Ocean scroll/wake/splash tuning is pack-authored under `gameplay.yml` → `ocean:`.
Per-model `fade_tiles` / `caustic_tint` let variants (e.g. `pond`) share that FX
motion while differing in shore blend length and caustic color.
Land `footsteps: true` only enables prints; actor models define them:

```yaml
# assets/.../models/actors/animal.yml
footsteps: true            # or false / { interval_ms, size, lifetime, alpha, fade_at, stride, texture }

# bee.yml
footsteps: false
```

`trail` kicks up land-colored particles across the mover's hitbox diameter.
Both omit cleanly when unset.

Model YAML files use an explicit `id` field (filename is for organization).
Item models use `item/<item_id>` ids, with shared abstracts under `item/type/...`.
Decoration models use `decoration/<id>` so they never collide with resource/structure
ids that share a bare name (for example `pine_tree`):

```yaml
id: item/wood_sword
extends: item/type/sword
texture: bundu/item/tool/wood_sword.svg
```

```yaml
id: decoration/beach
parts:
  main:
    sprite: bundu/decoration/beach/beach.svg
```

Definitions refer to textures as `bundu/structure/wall/wood_wall.png`. A later
pack can replace an asset by providing the same namespace and relative path.
Model definitions overlay by model ID in pack order.

`lang/<code>.yml` stays a single language document (Minecraft-style).

`assets/<namespace>/gameplay.yml` is client-only (shadows, etc.). It is served
with resource packs and is not read by the server simulation. `data/.../gameplay.yml`
remains the authoritative server sim config. Later packs replace the complete
client gameplay document.

## Client synchronization

The game server exposes protocol-v2 metadata at `/packs/manifest.json`. Before
serving packs, the server sanitizes client-facing assets:

- Textures are re-encoded to PNG (SVGs are rasterized, or the pack is rejected)
- Hard caps apply to file size, dimensions, count, and total bytes
- Model definitions are compiled server-side; clients receive only the compiled
  payload (`models.json` format 2)
- Raw pack `data/` YAML is never sent. Clients get a curated `registries.json`
  projection (IDs, tags, placement, ground models) plus authoritative world
  updates over the WebSocket

Clients SHA-256-check the registry projection, compiled models, and assets
before opening the WebSocket, then include the negotiated fingerprint in the
connection URL. The server rejects clients from older formats or a different
registry mapping. Development checkpoints also store the registry hash and are
ignored when their mapping is incompatible.

The client build also embeds a sanitized copy of the bundu base pack under
`/site/base-pack/`. When the game server's pack fingerprint matches that
bundle, the client loads models, registries, and textures from the same
origin instead of downloading them from the server. Overlay packs or a
different bundu revision change the fingerprint and fall back to a full
server sync.
