# Pack authoring

How to define content under `defs/<namespace>/`. For pack discovery, overlays,
and sync protocol, see the
[pack README](https://github.com/iRedSC/bundu.io/blob/main/packs/README.md).

```bash
bun run pack:gen          # defs/ → .generated/packs/*/{data,assets}
bun run validate:packs    # regenerates, then validates the runtime mirror
```

## Mental model

| Side | What | Where |
|---|---|---|
| Display (first `---` doc) | Models, poses, sprites | → generated `assets/` |
| Data (second `---` doc) | Gameplay | → generated `data/` |
| Recipes / loot / tags | Data-only files | `defs/.../recipes/`, `loot_tables/`, `tags/` |
| Textures | Manual | `defs/<ns>/client/textures/` (copied to generated `assets/`) |

Path owns identity. Don’t write `id:` unless it must differ from the file path.
Items default `extends` to `item_type:<ns>:none` — only set `extends` for a
non-default parent.

```yaml
# items/pinecone.yml — material with no special behavior
texture: bundu/item/material/pinecone.svg
---
{}
```

**Recipes stay separate** from items (own registry ids, link via `result.item`).
Multiple recipes may produce the same item.

---

## What’s in this guide

**Items:** materials, swords, helmets/hats, food, books, tools, placeables
**World:** resources, buildings (walls/doors/spikes), floors, roofs, fires,
crafting benches, point generators
**Also:** entities, decorations, ground, recipes, loot, tags, gameplay/lang,
shared models

---

## Items

**Path:** `defs/<ns>/items/<id>.yml`
**Gameplay id:** `<ns>:<id>` · **Model id:** `item:<ns>:<id>`

### Common data fields

| Field | Default | Meaning |
|---|---|---|
| `type` | `none` | Item-type template (`bundu:sword` or bare `sword`). Also the harvest tool key. |
| `function` | from type | `main_hand` \| `off_hand` \| `wear` \| `building` \| `backpack` |
| `level` | `0` | Tool level vs resource `level` |
| `stats` | `{}` | Consumable deltas (`hunger`, `thirst`, `health`, …) |
| `can_saturate` | `false` | Food may fill past normal hunger cap |
| `eat_duration_ms` | `1000` | Eat channel length |
| `places` | — | Structure id this item places |
| `whenEquipped` | — | Effect context while equipped (slot from `function`) |
| `onEquip` / `onUnequip` | — | One-shot item lock events (`lockItem`, `unlockItem`) |

Author `type: bundu:food` (namespaced); runtime stores the bare path (`food`) for
eat/harvest checks.

### Effect contexts (items)

An item has one `function`, so there is a single equip context — `whenEquipped` —
applied whenever that item is in its equipment slot.

```yaml
whenEquipped:
  "@s":
    attributes:
      attack.damage: { op: add, value: 13 }
      attack.damage.building: { op: add, value: 30 }  # + parent attack.damage
      movement.speed: { op: multiply, value: 0.8 }
    flags: [holding_book]          # optional
```

Ops: `addBase` \| `add` \| `multiply` (fold: `(Σ addBase + Σ add) × Π multiply`).
Attribute paths form a tree: parent keys (e.g. `attack.damage`) also apply to children
(`attack.damage.building`, `attack.damage.animal`) unless marked non-inheriting
(`health.defense.blocking`). Same for `temperature.insulation` →
`temperature.insulation.up` / `temperature.insulation.down` (resist heating /
cooling). Unknown attribute keys fail pack load.
`crafting.multiplier` / `crafting.speed` are direct multipliers (default `1`;
`2` → double, `0.5` → half). Multiplier scales ingredient costs (base amounts
≥ 2 cannot fall below 2); speed shortens craft duration. Multiplier is synced
to the client crafting list.
Targets: `"@s"` / `"@a[…]"` selectors, entity ids, `#tags`, or legacy
`type=`/`flag=` filter strings.

Selector filters: `type=`, `flag=`, `name=`, `mainhand=` / `offhand=` / `helmet=` /
`hasitem=` (item id or `#tag`), `ground=` (ground type id or `#tag`),
`time=` (`morning`/`day`/`evening`/`night`), `connected=` (`true`/`false`),
`distance=` (tiles: `N`, `N..`, `..N`, `N..M`). `@a` matches all player bodies;
use `@a[connected=true]` for online-only. Example — aura on everyone else within
10 tiles:

```yaml
whenEquipped:
  "@s":
    attributes:
      attack.damage: { op: add, value: 13 }
  "@a[distance=0.2..10]":
    flags: [near_banner]
```

### Equip events (`onEquip` / `onUnequip`)

Item locks are server-authoritative restrictions fired from an item's
`onEquip` and `onUnequip` events. Use them for equipment-owned behavior such as
a swap cooldown, a cursed item that cannot be removed, or gear that temporarily
disables another item. Ordinary attributes and flags that last while an item is
held belong in `whenEquipped`.

Both events fire once per equipment transition. Targets are resolved against
one stable world snapshot before equipment changes; the resulting lock and
unlock mutations apply only after the equipment state commits. Like
`whenEquipped`, each entry is keyed by a target selector:

```yaml
onEquip:
  "@s":
    lockItem:
      slots: [mainhand]
      lock: [equip, unequip]
      for: 500
```

`"@s"` is the player who equipped the item and should be the default. Other
effect selectors such as `"@a[distance=..5]"` are supported and apply only to
matched players. Broad selectors run on every equipment transition, so use them
only when the item intentionally affects other players.

Defining `onEquip` or `onUnequip` on a child replaces that complete event from
its item type; one-shot event blocks are not deep-merged.

#### `lockItem`

```yaml
lockItem:
  id: swap-delay
  items: [example:training_sword, "#example:heavy_weapons"]
  slots: [mainhand]
  lock: [equip, unequip, use, drop, craft]
  for: 2000
```

| Field | Required | Meaning |
|---|---:|---|
| `id` | No | Stable author-defined identity used by `unlockItem`. |
| `items` | Conditional | Non-empty list of item ids and/or item-registry `#tags`. |
| `slots` | Conditional | Non-empty list of `mainhand`, `offhand`, or `helmet`. |
| `lock` | Yes | Non-empty list of actions to restrict. |
| `for` | No | Non-negative duration in milliseconds. Omit for an indefinite lock. |

At least one of `items` or `slots` is required.

- With only `items`, equipment actions apply to those items in every equipment
  slot.
- With only `slots`, equipment actions apply to any item in those slots.
- With both, equipment actions require both the item and slot to match.
- `drop` and `craft` are item actions, so their rules require `items`; `slots`
  do not narrow those actions.

Item ids may be relative to the owning definition's namespace. Tags expand when
the pack loads.

| Action | Prevents |
|---|---|
| `equip` | Equipping a matching item into a matching slot. |
| `unequip` | Removing or replacing a matching equipped item. |
| `use` | Using equipped gear: attacking, blocking, eating, or placing structures. |
| `drop` | Dropping a matching item from inventory or the cursor. |
| `craft` | Consuming a matching item as a recipe ingredient. |

Replacing gear is checked as two operations: the current item must be allowed
to `unequip`, then the requested item must be allowed to `equip`. Forced cleanup
after an item is consumed or removed still clears stale equipment; a lock cannot
preserve an item that no longer exists.

A `craft` lock checks recipe ingredients, not the result. If wood is
craft-locked, recipes that consume wood are unavailable; recipes that merely
produce wood are unaffected. The server checks again when a timed craft
finishes, so a lock applied during the crafting channel cannot be bypassed.

#### Timed and indefinite locks

`for` uses authoritative game time in milliseconds. A timed lock expires
automatically; `for: 0` is valid but expires immediately. Omitting `for`
creates an indefinite lock that must be removed with `unlockItem`.

Give indefinite locks an `id` and reuse it in the releasing event:

```yaml
onEquip:
  "@s":
    lockItem:
      id: preserve-gems
      items: ["#example:gems"]
      lock: [craft]

onUnequip:
  "@s":
    unlockItem:
      id: preserve-gems
```

The same authored `id` resolves to the same source across both event blocks.
Ownership is also scoped to the player who caused the event, so two players
applying the same authored lock to one target do not overwrite or unlock each
other's rules.

An indefinite `unequip` lock normally prevents `onUnequip` from being reached.
Release it from a different equipment event, use a timed duration, or reserve it
for behavior that ends through forced cleanup such as death or inventory
removal.

#### `unlockItem`

The safest unlock targets an authored `id`:

```yaml
unlockItem:
  id: swap-delay
```

This removes only rules created with that identity by the same equipment-event
owner. When `id` is present, source identity is the complete match:
`items` and `slots` on that unlock object are ignored. Without an `id`, unlock
by matching items and/or slots:

```yaml
unlockItem:
  items: ["#example:heavy_weapons"]
  slots: [mainhand]
```

| Field | Required | Meaning |
|---|---:|---|
| `id` | No | Remove the exact authored source. May be used alone. |
| `items` | Conditional | Remove rules for these resolved item ids. |
| `slots` | Conditional | Remove slot-bound rules in these slots. |

Without `id`, at least one of `items` or `slots` is required. When both are
present, both must match. Prefer `id` when releasing a lock you own:
criteria-based unlocks are intentionally broad and can remove overlapping rules
from other sources.

#### Multiple independent rules

Both actions accept a single object or a list. Use separate rules when actions
need different durations or identities:

```yaml
onEquip:
  "@s":
    lockItem:
      - id: swap-delay
        slots: [mainhand]
        lock: [equip, unequip]
        for: 500
      - id: attack-warmup
        items: [example:training_sword]
        slots: [mainhand]
        lock: [use]
        for: 1200
      - id: protected-drop
        items: [example:training_sword]
        lock: [drop]
```

The server stores actions independently. Reapplying the same source, action,
item, and slot replaces that rule instead of accumulating duplicates. The most
recent application wins, even when its new expiry is sooner. Different
normalized rules and durations do not shorten or corrupt one another.

#### Player feedback

The client receives the authoritative lock set from the server:

- A full circular wipe appears while an equipment or drop restriction applies.
- A corner badge marks restrictions that exist but are inactive for the item's
  current equip state.
- Tooltips list restricted actions, matching slots, and remaining time.
- Denied `use` and `craft` actions flash the item and player lock HUD.
- A crafting button shows the lock when any consumed ingredient is
  craft-locked.

Client visuals are predictive only. Selection requests still go to the server,
which responds with the accepted or authoritative selected slot.

#### Validation and troubleshooting

Run:

```bash
bun run pack:gen
bun run validate:packs
```

Pack loading rejects unknown fields/actions, the legacy singular `item` field,
empty lists, unknown items or empty tags, invalid durations, `drop`/`craft`
without `items`, and rules with neither items nor slots.

If a slot rule appears ineffective, verify the item's `function`:

| Item `function` | Lock slot |
|---|---|
| `main_hand`, `building` | `mainhand` |
| `off_hand` | `offhand` |
| `wear` | `helmet` |

Also check whether a child replaced its inherited event, and use a stable `id`
when an unlock must target exactly one source.

### Display (item models)

Usually just `texture` + optional `extends: item_type:bundu:<type>`.
Display slots: `hand`, `inventory`, `icon`, `body`, `world`.

### Item types

**Path:** `defs/<ns>/item_types/<name>.yml`
Shared defaults for many items. May be display-only, data-only, or both (`---`).

| Type | Typical `function` | Used for |
|---|---|---|
| `none` | — | Materials, junk |
| `sword` / `spear` / `pickaxe` / `axe` / `hammer` / `knife` / `shovel` / `wrench` | `main_hand` | Tools/weapons |
| `helmet` / `hat` | `wear` | Head slot |
| `food` | `off_hand` | Edibles |
| `book` | `off_hand` | Utility held items |
| `building` | `building` | Placeables |
| `wall` / `door` / `spike` / `tree` | (display) | Visual abstracts for placeable/tree items |

---

### Swords

```yaml
# items/wood_sword.yml
extends: item_type:bundu:sword
texture: bundu/item/tool/wood_sword.svg
---
type: bundu:sword
level: 1
whenEquipped:
  "@s":
    attributes:
      attack.damage: { op: add, value: 5 }
      health.defense.blocking: { op: add, value: 2 }
```

Same pattern for spears (`type: bundu:spear`), hammers, knives, etc.
`level` matters when the item is also used as a harvest tool.

### Helmets (and hats)

```yaml
# items/wood_helmet.yml
extends: item_type:bundu:helmet
texture: bundu/item/equipment/wood_helmet.svg
---
type: bundu:helmet
whenEquipped:
  "@s":
    attributes:
      health.defense: { op: add, value: 5 }
```

Hats use `type: bundu:hat` / `extends: item_type:bundu:hat` (same `wear` slot).
Warmth gear often adds `temperature.*` attributes on `whenEquipped`.

### Food

```yaml
# items/meat_cooked.yml
extends: item_type:bundu:food
texture: bundu/item/food/meat_cooked.svg
---
type: bundu:food
stats:
  hunger: 20
# can_saturate: true
# eat_duration_ms: 1500
```

Held in off-hand; eat interaction consumes one and applies `stats`.

### Books

```yaml
# items/book.yml
extends: item_type:bundu:book
texture: bundu/item/book/book.svg
---
type: bundu:book
whenEquipped:
  "@s":
    flags: [holding_book]
```

`function: off_hand` from the type. Flags drive crafting requirements / UI.

### Placeable items (walls, fires, benches, …)

Always two defs: the **item** (inventory) and the **structure** (world).

```yaml
# items/wood_wall.yml
extends: item_type:bundu:wall
texture: bundu/structure/wall/wood_wall.png
---
type: bundu:building
places: wood_wall
```

`places` points at `structure:<ns>:wood_wall`. Crafting is a separate recipe file.

---

## Resources

Harvestable world nodes: trees, ores, corpses, hives, barriers.

**Path:** `defs/<ns>/resources/<id>.yml`
**Model:** `resource:<ns>:<id>` (or `# @pack-gen model=…` for odd paths)

```yaml
extends: model:bundu:single_tile_node
defaultVariant: base
variants:
  base:
    main: bundu/resource/copper_ore.png
parts:
  main:
    spillover: 50
---
score: 10
exclusive: true
multipliers:
  pickaxe: 1          # keys = bare item type paths
level: 2
regen_speed: 10
quantity: 20
loot_table: copper
```

| Field | Default | Meaning |
|---|---|---|
| `quantity` | `0` | Stock units |
| `loot_table` | — | Loot table id, or an inline table (registered as this resource's `namespace:path`; errors if that id already exists) |
| `level` | `0` | Vs tool `level` |
| `multipliers` | `{}` | Map of item type → amount scale (`pickaxe`, `knife`, …) |
| `exclusive` | `false` | Tool type must appear in `multipliers` |
| `regen_speed` | `0` | Seconds per +1 quantity |
| `decay` | — | Seconds to despawn (corpses) |
| `destroy_on_empty` | `false` | Remove node at 0 quantity |
| `score` | `0` | Score on harvest |
| `solid` | `true` | Blocks pathing |
| `whenOccupied` / `whenNearby` | — | Spatial effect contexts |

**Families in bundu:** trees (`pickaxe`, wood loot), ores (leveled `pickaxe`),
corpses (`knife`, `decay`, `destroy_on_empty`), hives (honey), barriers (`{}`).

Corpse example:

```yaml
# @pack-gen model=models/corpses/bear_dead.yml
extends: model:bundu:corpses/corpse
parts:
  body:
    sprite: bundu/entity/animal/bear/bear_dead.svg
    spriteScale: 2.5
---
decay: 30
destroy_on_empty: true
multipliers:
  knife: 2
quantity: 4
loot_table: bear_dead
```

---

## Buildings (structures)

**Gameplay path:** always `data/<ns>/buildings/<id>.yml`
**Author under:** `buildings/walls/`, `buildings/doors/`, `buildings/structures/`,
or flat `buildings/` (spikes/benches often data-only).

| `class` | Layer | Solid default | Notes |
|---|---|---|---|
| `wall` | structure | solid | `material` + `tier` for upgrades / spikes |
| `door` | structure | solid | Open state on model |
| `spike` | structure | solid | `damage`, `on_hit_damage`, `attack_range` |
| `building` | structure | solid | Fires, benches, anvil, point generators |
| `floor` | floor | **not** solid | Supported; no bundu content yet |
| `roof` | roof | **not** solid | Supported; occlusion systems exist |

### Shared building fields

| Field | Default | Meaning |
|---|---|---|
| `class` | `building` | Occupancy + solid default |
| `health` | `50` | |
| `material` | — | Spike↔wall/door matching; `quick_*` upgrade group |
| `tier` | — | Placeover rank within group |
| `solid` | by class | Override e.g. fires `solid: false` |
| `pointsPerSecond` | `0` | Point generator drip |
| `damage` / `on_hit_damage` / `attack_range` | — | Spikes |
| `placement.blocked` | `[[0,0]]` | Footprint tile offsets |
| `placement.ground` | `#bundu:buildable_ground` | Allowed ground types/tags |
| `whenNearby` / `whenOccupied` | — | Warmth, crafting flags, … |

### Walls

```yaml
# buildings/walls/wood_wall.yml
extends: model:bundu:walls/wall
defaultVariant: base
variants:
  base:
    main: bundu/structure/wall/wood_wall.png
    spike: bundu/structure/spike/wood_spike.png
---
class: wall
material: wood
tier: 1
health: 2000
```

### Doors

Same as walls with `class: door`, under `buildings/doors/`, `extends: model:bundu:doors/door`.

### Spikes

Usually **data-only** (art lives on the wall/door `spike` variant):

```yaml
# buildings/wood_spike.yml
class: spike
material: wood
tier: 1
damage: 20
on_hit_damage: 5
attack_range: 25
```

### Floors

Loader-ready; no bundu defs yet. Intended shape:

```yaml
# buildings/structures/wood_floor.yml  (suggested)
extends: model:bundu:single_tile_node   # or a floor abstract
# …parts / variants…
---
class: floor
health: 500
# solid defaults false
```

Floors use the **floor** occupancy layer (stack under structures).

### Roofs

```yaml
# buildings/structures/thatch_roof.yml  (suggested)
---
class: roof
health: 400
# solid defaults false
```

Roofs use the **roof** layer; client occlusion can hide them when inside.

### Fires

```yaml
# buildings/structures/fire_pit.yml
extends: model:bundu:structures/fire
defaultVariant: base
variants:
  base:
    main: bundu/structure/crafting/fire_pit.svg
---
class: building
solid: false
health: 1000
whenNearby:
  stack: max
  proximityDistance: 200
  "@a":
    attributes:
      temperature.warmth: { op: add, value: 35 }
    flags: [near_fire]
```

Item side: `type: bundu:building` + `places: fire_pit`.
Recipes often `requirements: [near_fire]`.

### Crafting benches (workbench, anvil)

Data-only structures today (add a display half if you want world art):

```yaml
# buildings/workbench.yml
class: building
health: 800
whenNearby:
  proximityDistance: 200
  "@a":
    flags: [near_crafting_table]
```

Anvil uses `flags: [near_anvil]`. Matching placeable items set `places: workbench`
/ `places: anvil`.

### Point generators

```yaml
# buildings/structures/point_generator.yml — multi-tile display + …
---
class: building
health: 1000
pointsPerSecond: 2
placement:
  blocked: [[0,0],[1,0],[0,1],[1,1]]
  ground: ["#bundu:buildable_ground"]
```

---

## Entities (animals)

**Path:** `defs/<ns>/entities/<id>.yml`
**Model:** `entity_type:<ns>:<id>` (usually `extends: model:bundu:actors/animal`)

Shared gameplay defaults live under **`animal_types/`** (same role as `item_types/`
for items). Author `type: bundu:land` on the entity data half; nested
`spawn` / `movement.avoid` fields coalesce per-key (entity overrides type).

| Field | Default | Meaning |
|---|---|---|
| `type` | — | Animal-type template (`land`, `scared`, `aquatic`, …) |
| `behavior` | `passive` | `hostile` \| `neutral` \| `passive` \| `scared` |
| `health` | `100` | |
| `score` | `0` | |
| `detectionRange` / `loseSightRange` | `300` / `450` | World units |
| `passiveSpeed` / `activeSpeed` | `4` / `6` | Per 20 TPS tick |
| `scale` | `1` | Size in tiles |
| `hasHome` | `false` | Idle roam tethered to spawn (bees) |
| `wander_distance` | `300` | Idle roam radius (from home when `hasHome`) |
| `attack_damage` / `attack_interval_ms` / `attack_reach` | `0` / `1000` / `65` | |
| `aggroSwitch` | `never` | `never` \| `onHit` \| `random` |
| `aggroLevel` | `high` | `high` \| `medium` \| `low` |
| `ignorePreferredWhenAggro` | `false` | Ignore `movement.avoid` while chasing |
| `aggroAt` | `[]` | Structures/tags to attack without a player |
| `corpse` | required | Resource id for the body |
| `spawn_count` | `0` | Per-species worldgen budget (also needs `gameplay.worldgen.animals`) |
| `spawn.ground` | `#bundu:buildable_ground` | Allowed ground types/tags (same resolve as `placement.ground`) |
| `movement.avoid.ground` | `[]` | Ground types/tags to path around |
| `movement.avoid.strength` | `8` | Soft A* step-cost addend (ignored when `hard`) |
| `movement.avoid.hard` | `false` | Ban avoided tiles unless escaping |
| `movement.allowEmergencyEscape` | `true` | Ignore avoid when stuck / no other path |

Standing on avoided ground always bypasses avoid and seeks the nearest safe tile.

### Animal types

**Path:** `defs/<ns>/animal_types/<name>.yml` (data-only)

| Type | Typical use |
|---|---|
| `land` | Buildable spawn + soft water avoid |
| `scared` | Prey family (deer / raindeer speeds + avoid) |
| `aquatic` | Water spawn + avoid buildable ground |

```yaml
# entities/deer.yml
extends: model:bundu:actors/animal
parts:
  body:
    sprite: bundu/entity/animal/deer/deer.svg
    spriteScale: 2.5
---
type: bundu:scared
health: 100
score: 250
corpse: deer_dead
spawn_count: 8
```

```yaml
# entities/raindeer.yml — override biome + hard avoid
type: bundu:scared
spawn:
  ground: [snow]
movement:
  avoid:
    hard: true   # keep type's avoid.ground
```

Display inheritance stays on the model half (`extends: model:bundu:actors/animal`).

Player is a special entity def (`kind: player`) — not an `AnimalConfig`.

---

## Decorations

Biome clutter. **Path:** `defs/<ns>/decorations/<id>.yml`

```yaml
parts:
  main:
    sprite: bundu/decoration/beach/beach.svg
---
size: 200    # default 80
z: 0         # default 10 — paint order
```

---

## Ground types

**Path:** `defs/<ns>/ground_types/<id>.yml`
Display → `ground_models/` (not entity models). Data → `ground_types`.

```yaml
kind: solid
color: "#2a462b"
fill: forest_blobs          # optional: sand_bands | forest_blobs | solid_blobs
---
model: grass                # must match this ground model id
# overheat: true
# whenOccupied: { … flags: [in_water] … }
```

Ocean models use `kind: ocean` + required `textures` (caustics, displace, ripples,
foam, sparkle). Optional `fade_tiles`, `caustic_tint`. Motion tuning lives in
**client** `gameplay.yml` → `ocean:`.

---

## Recipes (separate)

**Path:** `defs/<ns>/recipes/<id>.yml` — own registry id, **not** the item name.

```yaml
result:
  item: wood_wall
  amount: 1
duration: 2000
score: 15
ingredients:
  wood: 25
requirements:
  - near_crafting_table    # flag names from nearby structures / contexts
```

| Field | Rules |
|---|---|
| `result.item` | Item ref (required) |
| `result.amount` | Positive int, default `1` |
| `duration` | ms, default `0` |
| `score` | default `0` |
| `ingredients` | Map of item → count |
| `requirements` | Flag names (`near_fire`, `near_crafting_table`, `near_anvil`, …) |

Two recipes may share the same `result.item` — use distinct file/ids.

---

## Loot tables

**Path:** `defs/<ns>/loot_tables/<id>.yml` — referenced by `loot_table:` on resources
(string id), **or** inline on the resource as an object (same schema). Inline tables
register under the resource’s own `namespace:path` and throw if that loot table id
already exists.

**Fixed** (bundu’s style):

```yaml
type: fixed
entries:
  - item: meat
    count: 3
  - item: bear_fur
    count: 1
```

Inline on a resource:

```yaml
quantity: 4
loot_table:
  type: fixed
  entries:
    - item: meat
      count: 3
```

**Pool** (supported, unused in bundu): weighted entries, `rolls`, count ranges
`{ min, max }`.

---

## Tags

**Path:** `defs/<ns>/tags/<registry>/<id>.yml` → `#<ns>:<id>`

```yaml
category: true
values:
  - wood_wall
  - "#bundu:extra_walls"
# replace: true   # default false = append across packs
```

Used for `aggroAt`, `placement.ground`, `spawn.ground`, editor filters, worldgen lists, etc.
Singular refs (e.g. `corpse`) reject tags.

---

## Server vs client config docs

| File | Role |
|---|---|
| `defs/<ns>/gameplay.yml` | **Server** sim (vitals, day cycle, player defaults, worldgen, …) |
| `defs/<ns>/client/gameplay.yml` | **Client** shadows + ocean FX |
| `defs/<ns>/client/stat_bars.yml` | HUD bars |
| `defs/<ns>/client/lang/<code>.yml` | Names / descriptions |

---

## Shared model abstracts

Under `defs/<ns>/models/`:

| Path | Role |
|---|---|
| `base/rottable.yml`, `single_tile_node.yml` | Tile entity bases |
| `actors/animal.yml` | Animal defaults + footsteps |
| `walls/wall.yml`, `doors/door.yml` | Wall/door graphs (`abstract: true`) |
| `structures/fire.yml` | Fire abstract |
| `corpses/corpse.yml` | Dead pose |

`item_types/` and `models/base/` are inferred abstract. Mixed folders still need
`abstract: true` on templates.

---

## Easy to forget

Beyond “items / resources / buildings”:

1. **Item types** — templates separate from items
2. **Animal types** — templates separate from entities (`type: bundu:land`)
3. **Item ↔ structure split** for placeables (`places`)
4. **Doors, spikes, walls** as structure classes
5. **Floors & roofs** — supported, no bundu content yet
6. **Entities + corpses-as-resources**
7. **Decorations** and **ground types/models**
8. **Recipes & loot** as first-class ids (recipes ≠ item names)
9. **Tags**
10. **Two gameplay.yml files** (server vs client) + lang / stat bars
11. **Textures** directory (hand-authored)
12. **Backpacks**, flags on books/scuba/medallions, point generators

---

## New placeable checklist

1. `items/foo.yml` — texture + `type: bundu:building` + `places: foo`
2. `buildings/…/foo.yml` — `class` + health (+ `whenNearby` if needed)
3. `recipes/foo.yml` — if craftable (own id; `result.item: foo`)
4. `client/lang/en.yml` — `item.foo` / `structure.foo`
5. `bun run pack:gen` && `bun run validate:packs`
