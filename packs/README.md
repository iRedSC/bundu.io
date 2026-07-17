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

## Gameplay registries

Gameplay definitions use canonical `namespace:path` IDs. The server currently
loads these registries independently:

- `item`
- `structure`
- `resource`
- `entity_type`
- `ground_type`
- `recipe`
- `loot_table`

Aggregate files such as `data/<namespace>/entities.yml` derive the namespace
from their directory and the path from each top-level key. Recipes and loot
tables are independent files whose relative filename becomes the path:

```text
data/bundu/recipes/wood_wall.yml          -> bundu:wood_wall
data/bundu/loot_tables/bear_dead.yml      -> bundu:bear_dead
```

Bare entry references resolve relative to the definition's namespace. Use an
explicit ID to cross namespaces:

```yaml
corpse: bundu:bear_dead
```

Registry IDs are separate. `item:bundu:wood_wall` and
`structure:bundu:wood_wall` are distinct entries even when they share a resource
location. Cross-registry relationships must be explicit—for example, a
placeable item uses `places` to reference its structure.

Aggregate registry records overlay by canonical ID. A later definition replaces
the complete earlier definition rather than deep-merging it. Single documents,
including `gameplay.yml`, replace the complete document.

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

Asset files use namespaced logical paths:

```text
assets/bundu/textures/structure/wall/wood_wall.png
assets/bundu/visuals/items/items.yml
assets/bundu/lang/en.yml
```

Definitions refer to textures as `bundu/structure/wall/wood_wall.png`. A later
pack can replace an asset by providing the same namespace and relative path.
Visual definitions overlay by visual ID in pack order.

## Client synchronization

The game server exposes protocol-v2 metadata at `/packs/manifest.json`. Clients
SHA-256-check the effective registry projection, visual definitions, and assets
before opening the WebSocket, then include the negotiated fingerprint in the
connection URL. The server rejects clients from older formats or a different
registry mapping. Development checkpoints also store the registry hash and are
ignored when their mapping is incompatible.
