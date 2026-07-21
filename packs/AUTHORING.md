# Pack authoring catalog (`defs/`)

Author under `defs/<namespace>/`. Run `bun run pack:gen` to emit `data/` (server)
and `assets/` (client). `bun run validate:packs` runs `pack:gen --check` first.

High-level discovery and sync live in [README.md](./README.md). This file is the
field-level catalog: where defs live, minimal examples, loader fields, defaults,
and client vs server ownership.

## Combined defs (`---`)

Paired registries use YAML document split:

1. **First doc** → display (models / ground models)
2. **Second doc** → data (server registries)

```yaml
# display
extends: item_type:bundu:sword
texture: bundu/item/tool/wood_sword.svg

---
# data
type: bundu:sword
level: 1
```

- Single-doc in a paired folder → **data-only** (no model emit).
- Single-doc under `models/` or `client/` → **assets-only**.
- Optional directive (before docs): `# @pack-gen model=models/nature/tree.yml`
  overrides the default model output path.
- **Do not** write redundant `id:` or `extends: item_type:<ns>:none` — path owns
  identity; items/item_types default `extends` to `item_type:<ns>:none`.

### Path → emit mapping

| `defs/<ns>/…` | display → `assets/<ns>/` | data → `data/<ns>/` |
|---|---|---|
| `items/X.yml` | `models/items/X.yml` | `items/X.yml` |
| `item_types/X.yml` | `models/items/type/X.yml` | `item_types/X.yml` |
| `entities/X.yml` | `models/actors/X.yml` | `entities/X.yml` |
| `decorations/X.yml` | `models/decorations/X.yml` | `decorations/X.yml` |
| `resources/X.yml` | `models/resources/X.yml` (or `@pack-gen model=…`) | `resources/X.yml` |
| `buildings/walls/X.yml` | `models/walls/X.yml` | `buildings/X.yml` |
| `buildings/doors/X.yml` | `models/doors/X.yml` | `buildings/X.yml` |
| `buildings/structures/X.yml` | `models/structures/X.yml` | `buildings/X.yml` |
| `buildings/X.yml` (flat) | `models/structures/X.yml` if display present | `buildings/X.yml` |
| `ground_types/X.yml` | `ground_models/X.yml` | `ground_types/X.yml` |
| `models/**` | `models/**` | — |
| `recipes/**`, `loot_tables/**`, `tags/**` | — | same relative path |
| `client/**` | copied into `assets/<ns>/` | — |
| `<ns>/gameplay.yml` (defs root) | — | `gameplay.yml` (**server**) |

Nested building folders encode the models subfolder; the data stem is always the
basename (`walls/wood_wall` → `data/.../buildings/wood_wall.yml`).

### Model ids

Path-derived: `kind:namespace:path` (see `@bundu/shared/models/ids`).

| Kind | Example | Source |
|---|---|---|
| `item` | `item:bundu:wood_sword` | `items/wood_sword.yml` |
| `item_type` | `item_type:bundu:sword` | `item_types/sword.yml` |
| `structure` | `structure:bundu:wood_wall` | `buildings/walls/wood_wall.yml` |
| `resource` | `resource:bundu:pine_tree` | `resources/pine_tree.yml` |
| `decoration` | `decoration:bundu:beach` | `decorations/beach.yml` |
| `entity_type` | `entity_type:bundu:bear` | `entities/bear.yml` |
| `model` | `model:bundu:animal` | shared abstracts under `models/` |

Inferred abstract paths: `models/items/type/**`, `models/base/**`. Elsewhere set
`abstract: true` (e.g. `models/walls/wall.yml`).

Gameplay registry ids remain `namespace:path` (e.g. `bundu:wood_wall`). Item and
structure with the same path are **different** registries; link with `places`.

Textures are **not** generated — author under `assets/<ns>/textures/`.

---

## Shared: effect contexts (`when*`)

Parsed in `packages/server/src/configs/loaders/effect_context.ts`.

| Context | Allowed on | Default `stack` | Extra meta |
|---|---|---|---|
| `whenMainHand` | items (+ item_types merge) | `replace` | — |
| `whenOffHand` | items (+ item_types) | `replace` | — |
| `whenHelmet` | items (+ item_types) | `replace` | — |
| `whenOccupied` | structures, resources, ground_types | `stack` | `occupationType`: `center` \| `collider` (default `center`) |
| `whenNearby` | structures, resources | `stack` | **required** `proximityDistance` (world units / decitiles) |

Equip contexts **cannot** use `stack: stack`. Spatial may use `replace` \| `stack` \| `max`.

Target keys under a context:

- `"*"` — all subjects
- bare entity id / `#tag` — entity_type set
- filter string e.g. `type=bundu:player,flag=in_water`

Per-target payload:

```yaml
hide:                    # optional identity scrub (client-relevant via anon)
  full / name / skin / helmet / mainHand / offHand / backpack / leaderboard: bool
attributes:
  "<attr>": { op: add|multiply, value: number }
flags: ["near_fire", ...]   # string names → runtime flag registry
```

Known server attributes (`AttributeList`):  
`attack.damage`, `attack.speed`, `attack.origin`, `attack.reach`, `attack.sweep`,
`movement.speed`, `physics.scale`, `placement.reach`,
`health.max`, `health.regen_amount`, `health.defense`, `health.defense.blocking`,
`hunger.*`, `eating.movement_speed_multiplier`,
`temperature.*`, `thirst.*`, `air.*`.

Unknown attribute keys are kept for forward-compat (e.g. pack-authored
`attack.damage.building` / `attack.building.damage` on hammers/wrenches — not in
`AttributeList` today).

### Placement allow/deny (structures + resources)

Optional lists; **omitted = allow all**, **empty array = allow none**, deny wins.

| Field | Type |
|---|---|
| `allowedStructures` / `deniedStructures` | `string[]` → structure ids/tags |
| `allowedRoofs` / `deniedRoofs` | `string[]` |
| `allowedFloors` / `deniedFloors` | `string[]` |
| `allowedResources` / `deniedResources` | `string[]` |

---

## Items generally

**Defs:** `defs/<ns>/items/<path>.yml`  
**Registries:** `item:<ns>:<path>` (model), `item` gameplay id `<ns>:<path>`

### Minimal examples

Material (defaults to `item_type:<ns>:none`):

```yaml
texture: bundu/item/material/pinecone.svg
---
{}
```

Typed tool:

```yaml
extends: item_type:bundu:sword
texture: bundu/item/tool/wood_sword.svg
---
type: bundu:sword
level: 1
whenMainHand:
  "*":
    attributes:
      attack.damage: { op: add, value: 13 }
```

Placeable:

```yaml
extends: item_type:bundu:wall
texture: bundu/structure/wall/wood_wall.png
---
type: bundu:building
places: wood_wall
```

### Data fields (`ItemConfig` + parse in `load.ts`)

| Field | Type | Default | Meaning |
|---|---|---|---|
| `type` | `string \| null` | `null` (loader treats missing as `"none"` for template merge) | Item-type template key (`bundu:sword` or bare `sword`). Merges that `item_types` data + contexts. Also used as harvest tool key (see Resources). |
| `function` | `string \| null` | `null` (often from item_type) | Equip behavior: `main_hand`, `off_hand`, `wear`, `building`, `backpack` |
| `level` | `number` | `0` | Tool level vs resource `level` when harvesting |
| `stats` | `Record<string, number>` | `{}` | Consumable deltas (`hunger`, `thirst`, `health`, …). Merged with item_type `stats`. |
| `unequip_delay` | `number` | `0` | Loader field (ms); unused widely in packs |
| `can_saturate` | `boolean` | `false` | Food: allow hunger up to `player.hunger_saturation_limit` |
| `eat_duration_ms` | `number` | `1000` | Eat channel time |
| `places` | structure ref \| null | `null` | Placeable → structure id |
| `whenMainHand` / `whenOffHand` / `whenHelmet` | effect contexts | — | Merged with item_type contexts |

**Server.** Display half is **client** (model compile).

`function` equip mapping (`inventory.ts`):

| `function` | Slot |
|---|---|
| `wear` | helmet |
| `main_hand` | mainHand |
| `off_hand` | offHand |
| `building` | mainHand (placement mode) |
| `backpack` | backpack slot (special) |

Eating requires `type === "food"` in current server checks while bundu defs use
`type: bundu:food` — prefer documenting the authored form; fix server/bare-key
alignment separately if needed.

### Display / model side

Typical item display: `texture`, optional `extends`, optional `displays` overrides
(`hand`, `inventory`, `icon`, `body`, `world`). Parts/slots rare on items; used
heavily on actors.

---

## Item types (`item_types`)

**Defs:** `defs/<ns>/item_types/<name>.yml` (flat only)  
**Models:** `item_type:<ns>:<name>` → `assets/.../models/items/type/`  
**Data:** `data/.../item_types/` (merged into items via `type:`)

May be display-only, data-only, or paired. Single-doc heuristics: if it looks like
a model (`texture` / `parts` / `displays` / `extends` / `abstract` / `id`) → assets;
else → data.

### Bundu item_types

| Type | Display role | Data defaults |
|---|---|---|
| `none` | fallback texture + empty displays | (display-only) |
| `sword` | hand/inventory poses | `function: main_hand` + attack attrs |
| `spear` | long hand pose | `main_hand` + reach/origin |
| `pickaxe` | hand/inventory | `main_hand` + reach |
| `axe` | (often inherits pickaxe visuals on items) | `main_hand` + speed/reach |
| `hammer` | hand pose | `main_hand` + reach |
| `knife` / `shovel` / `wrench` | often no display doc | `main_hand` + reach |
| `helmet` | `displays.body` scale 1.4 | `function: wear` |
| `hat` | `displays.body` | `function: wear` |
| `food` | hand pose | `function: off_hand` + eating slow |
| `book` | hand pose | `function: off_hand` |
| `building` | hand pose | `function: building` + move slow |
| `wall` | `extends: item_type:bundu:building` | (display-only chain) |
| `door` / `spike` | hand poses | (display-only; items set `type: bundu:building`) |
| `tree` | `displays.world` scale | (display-only) |

Items set **data** `type:` to merge gameplay defaults, and **display** `extends:`
for visuals (can differ — e.g. shovel `extends: item_type:bundu:pickaxe` but
`type: bundu:shovel`).

---

## Items by specialization (bundu patterns)

| Kind | Def path | `extends` (display) | `type` (data) | Notes |
|---|---|---|---|---|
| Sword | `items/*_sword.yml` | `item_type:bundu:sword` | `bundu:sword` | `level`, `whenMainHand` damage/block |
| Helmet | `items/*_helmet.yml` | `item_type:bundu:helmet` | `bundu:helmet` | `whenHelmet` → `health.defense` |
| Hat | `items/beanie.yml`, `coat.yml`, … | `item_type:bundu:hat` | `bundu:hat` | warmth via `whenHelmet` |
| Food | `items/meat.yml`, berries, … | `item_type:bundu:food` | `bundu:food` | `stats.hunger` / `thirst` / `health`; optional `can_saturate` |
| Book | `items/book.yml`, … | `item_type:bundu:book` | `bundu:book` | flags e.g. `holding_book` |
| Pickaxe | `items/*_pickaxe.yml` | `item_type:bundu:pickaxe` | `bundu:pickaxe` | harvest key for ores/trees in bundu |
| Spear | `items/*_spear.yml` | `item_type:bundu:spear` | `bundu:spear` | |
| Hammer | `items/*_hammer.yml` | `item_type:bundu:hammer` | `bundu:hammer` | building damage attrs (forward-compat keys) |
| Axe | `items/lumber_axe.yml` | often pickaxe visual | `bundu:axe` | |
| Shovel / knife / wrench | respective items | often pickaxe visual | `bundu:shovel` / `knife` / `wrench` | corpses use `knife` multiplier |
| Spike / door / wall items | `items/*_{spike,door,wall}.yml` | matching item_type | `bundu:building` + `places:` | |
| Fires / benches / anvil / point_generator | `items/fire_*.yml`, `workbench.yml`, … | `item_type:bundu:building` | `bundu:building` + `places:` | |
| Backpack | `items/backpack.yml` | default none | `function: backpack` | |
| Materials | `items/wood.yml`, ores as items, … | default none | `{}` | |

Food `stats` keys seen in packs: `hunger`, `thirst`, `health`, `heal_ticks`
(`heal_ticks` / `poison_ticks` exist on `StatList`; food→stat wiring for ticks is
thin — treat as authored intent).

---

## Resources

**Defs:** `defs/<ns>/resources/<path>.yml`  
**Registry:** `resource` / model `resource:<ns>:<path>` (unless `@pack-gen` + explicit model id)

### Minimal examples

Ore:

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
  pickaxe: 1
level: 2
regen_speed: 10
quantity: 20
loot_table: copper
```

Corpse:

```yaml
# @pack-gen model=models/corpses/bear_dead.yml
extends: model:bundu:corpse
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

Hive / barrier: same resource schema; barrier may be `{}` data.

### Data fields (`ResourceConfig`)

| Field | Type | Default | Meaning |
|---|---|---|---|
| `destroy_on_empty` | `boolean` | `false` | Remove when quantity hits 0 |
| `score` | `number \| null` | `0` | Score on harvest/destroy |
| `level` | `number` | `0` | Vs tool level; `-1` special-cases amount to multiplier only |
| `exclusive` | `boolean` | `false` | If true, tool type must appear in `multipliers` |
| `multipliers` | `Record<string, number>` | `{}` | Keys = item `type` strings (`pickaxe`, `knife`, …). Harvest amount ≈ `(toolLevel - level + 1) * multiplier` |
| `decay` | `number \| null` | `null` | Seconds until despawn (corpses) |
| `regen_speed` | `number` | `0` | Seconds per +1 quantity (`0` = no regen) |
| `quantity` | non-neg int | `0` | Starting/max stock units |
| `loot_table` | loot_table ref | — | YAML key; loader → `lootTable` id |
| `solid` | `boolean` | `true` | Blocks movers on structure layer |
| `whenOccupied` / `whenNearby` | spatial contexts | — | |
| placement allow/deny | see above | — | |

**Server** data; display **client**.

### Bundu resource families

| Family | Examples | Typical data |
|---|---|---|
| Trees | `pine_tree`, `forest_tree`, `savanah_tree`, `pine_tree_snow` | `exclusive`, `pickaxe` mult, regen, loot → wood |
| Ores | `stone`, `copper`, `silver`, `cobalt` | leveled `pickaxe`, loot → material items |
| Corpses | `*_dead`, `player_dead` | `decay`, `destroy_on_empty`, `knife` mult |
| Hives | `hive_{small,medium,large}` | `destroy_on_empty`, honey loot |
| Props | `stone_barrier` | often empty `{}` |

`forest_tree` uses `# @pack-gen model=models/nature/tree.yml` and may set explicit
`id: resource:bundu:forest_tree` when path ≠ identity.

---

## Buildings / structures

**Defs:**

| Class / role | Typical def path | Model emit |
|---|---|---|
| Wall | `buildings/walls/<id>.yml` | `models/walls/` |
| Door | `buildings/doors/<id>.yml` | `models/doors/` |
| Spike | `buildings/<id>_spike.yml` (often **data-only**) | (none; art on wall/door variants) |
| Generic building | `buildings/structures/<id>.yml` or flat `buildings/<id>.yml` | `models/structures/` |
| Floor / roof | *supported by loader; **no bundu examples yet*** | same as structures / custom |

Gameplay registry: always `data/<ns>/buildings/<basename>.yml` → `structure:<ns>:<id>`.

### Minimal examples

Wall:

```yaml
extends: model:bundu:wall
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

Spike (data-only):

```yaml
class: spike
material: wood
tier: 1
damage: 20
on_hit_damage: 5
attack_range: 25
```

Fire:

```yaml
extends: model:bundu:fire
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
  "*":
    attributes:
      temperature.warmth: { op: add, value: 35 }
    flags: [near_fire]
```

Workbench / anvil (data-only today — **no structure model**; world art may be missing unless you add a display half):

```yaml
class: building
health: 800
whenNearby:
  proximityDistance: 200
  "*":
    flags: [near_crafting_table]  # anvil → near_anvil
```

Point generator (multi-tile):

```yaml
# display: extends single_tile_node + tile.footprint ascii …
---
class: building
health: 1000
pointsPerSecond: 2
placement:
  blocked: [[0,0],[1,0],[0,1],[1,1]]
  ground: ["#bundu:buildable_ground"]
```

### Data fields (`BuildingConfig`)

| Field | Type | Default | Meaning |
|---|---|---|---|
| `class` | `building` \| `door` \| `spike` \| `wall` \| `floor` \| `roof` | `building` | Occupancy layer + solid default |
| `health` | `number` | `50` | |
| `pointsPerSecond` | `number` | `0` | Point generator score drip |
| `material` | `string?` | — | Spike↔wall/door match; `quick_*` upgrade group |
| `tier` | `number?` | — | Placeover rank within upgrade group |
| `damage` | `number?` | — | Spike contact damage |
| `on_hit_damage` | `number?` | — | Reflect when spiked structure hit |
| `attack_range` | `number?` | — | Extra contact radius (world units) |
| `solid` | `boolean` | wall/door/building/spike **true**; floor/roof **false** | Pathing / blockers |
| `placement.blocked` | `[x,y][]` | `[[0,0]]` | Footprint offsets |
| `placement.ground` | ground_type refs/tags | `["#bundu:buildable_ground"]` | Allowed ground |
| spatial contexts + allow/deny | | | |

**Server** data; display **client**.

### Class specialization

| Class | Layer | Solid default | Bundu usage |
|---|---|---|---|
| `wall` | structure | solid | materials + tiers; spike variant textures |
| `door` | structure | solid | open state on model; same material/tier |
| `spike` | structure | solid | damage fields; pairs by `material` |
| `building` | structure | solid (override `solid: false` for fires) | fires, benches, anvil, point_generator |
| `floor` | floor | not solid | loader-ready; no pack defs yet |
| `roof` | roof | not solid | loader-ready; occlusion/hide systems exist |

Recipe flags from nearby buildings: `near_fire`, `near_crafting_table`, `near_anvil`.

---

## Entities / animals

**Defs:** `defs/<ns>/entities/<path>.yml`  
**Registry:** `entity_type` / model `entity_type:<ns>:<path>`  
**Player** is special: display + `kind: player` data; **not** loaded into `AnimalConfigs`.

### Minimal animal

```yaml
extends: model:bundu:animal
parts:
  body:
    sprite: bundu/entity/animal/bear/bear.svg
    spriteScale: 2.5
---
health: 350
score: 500
behavior: hostile
detectionRange: 300
loseSightRange: 450
passiveSpeed: 7
activeSpeed: 11
attack_damage: 35
scale: 0.8
hasHome: true
aggroSwitch: onHit
aggroLevel: medium
corpse: bear_dead
spawn_count: 4
aggroAt: ["#bundu:walls"]
```

### Data fields (`AnimalConfig`)

| Field | Type | Default | Meaning |
|---|---|---|---|
| `score` | `number` | `0` | |
| `behavior` | `hostile` \| `neutral` \| `passive` \| `scared` | `passive` | Aggro / flee |
| `health` | `number` | `100` | |
| `detectionRange` | `number` | `300` | World units |
| `loseSightRange` | `number` | `450` | |
| `passiveSpeed` / `activeSpeed` | `number` | `4` / `6` | Per 20 TPS tick |
| `scale` | `number` | `1` | Size in tiles (1 → diameter 1 tile) |
| `hasHome` | `boolean` | `true` | Idle roam homeward+wander |
| `wander_distance` | `number` | `300` | |
| `attack_damage` | `number` | `0` | |
| `attack_interval_ms` | `number` | `1000` | |
| `attack_reach` | `number` | `65` | Past body radius |
| `aggroSwitch` | `never` \| `onHit` \| `random` | `never` | |
| `aggroLevel` | `high` \| `medium` \| `low` | `high` | |
| `aggroAt` | structure refs/tags | `[]` | Attack structures w/o player target |
| `corpse` | resource ref | required for animals | |
| `spawn_count` | `number` | `0` | Worldgen / spawn budget |

**Server** animal data; display **client** (`extends: model:bundu:animal`, parts,
`footsteps`, animations).

---

## Decorations

**Defs:** `defs/<ns>/decorations/<path>.yml`

```yaml
parts:
  main:
    sprite: bundu/decoration/beach/beach.svg
---
size: 200
z: 0
```

### Data fields (`DecorationConfig`)

| Field | Type | Default | Meaning |
|---|---|---|---|
| `size` | positive `number` | `80` | Base world size at scale 1 |
| `z` | safe integer | `10` | Paint order |

**Server** size/z; display **client**.

---

## Ground types + ground models

**Defs:** `defs/<ns>/ground_types/<path>.yml`  
Display half → `ground_models/` (**not** entity ModelDefs).  
Data → `ground_types` registry.

```yaml
kind: solid
color: "#2a462b"
fill: forest_blobs
---
model: grass
```

Ocean + effects:

```yaml
kind: ocean
color: "#1a5f8a"
textures: { caustics, displace, ripple_idle, ripple_move, foam, sparkle: … }
---
model: ocean
whenOccupied:
  occupationType: center
  "*":
    flags: [in_water]
    attributes: { … }
```

### Data fields (`GroundTypeConfig`) — **server**

| Field | Type | Default | Meaning |
|---|---|---|---|
| `model` | non-empty string | `"grass"` | Client ground-model id |
| `overheat` | `boolean` | `false` | Max-heat players take overheat damage |
| `whenOccupied` | effect context | — | Only spatial context allowed here |

### Display fields (ground model parse) — **client**

**Solid:** `kind: solid`, `color` (`#rrggbb`), optional `fill` (`sand_bands` \|
`forest_blobs` \| `solid_blobs`), optional `footsteps: true`, optional `trail: {…}`.

**Ocean:** `kind: ocean`, `color`, `textures` (required set), optional
`fade_tiles` (default 12), optional `caustic_tint: { a, b }`.

Trail defaults (when partially specified): spacing 14, amount `[2,4]`, etc.
(see `packages/shared/src/ground_models.ts`).

Ocean motion tuning is **client** `gameplay.yml` → `ocean:` (not per ground type).

---

## Recipes (separate defs)

**Defs:** `defs/<ns>/recipes/<path>.yml` → `data/.../recipes/` only  
**Registry:** `recipe` — id independent of result item.

```yaml
result:
  item: wood_wall
  amount: 1
duration: 2000
score: 15
ingredients:
  wood: 25
requirements:
  - near_crafting_table
```

| Field | Type | Default / rules |
|---|---|---|
| `result.item` | item ref | required |
| `result.amount` | positive int | `1` |
| `duration` | non-neg number | `0` if omitted |
| `score` | non-neg number | `0` |
| `ingredients` | map item→positive int | required object (may be empty) |
| `requirements` | `string[]` | flag names (`near_fire`, …) resolved after contexts register flags |

**Server** (authoritative); client gets packed recipe list.

---

## Loot tables

**Defs:** `defs/<ns>/loot_tables/<path>.yml`  
Referenced by resources as `loot_table: <id>`.

### Fixed

```yaml
type: fixed
entries:
  - item: meat
    count: 3
  - item: bear_fur
    count: 1
```

One harvest hit yields one unit from the multiset (seeded). Count must be a single
positive int (no ranges). Omitted `count` → `1`.

### Pool

```yaml
type: pool
pools:
  - rolls: 1
    entries:
      - item: meat
        weight: 3
        count: { min: 1, max: 2 }
```

| Field | Rules |
|---|---|
| `rolls` | positive int, default 1 |
| `weight` | positive int, default 1 |
| `count` | int or `{ min, max }` inclusive |

Bundu currently ships **fixed** tables only; pool is supported by the loader.

**Server.**

---

## Tags

**Defs:** `defs/<ns>/tags/<registry>/<path>.yml` → `#<ns>:<path>`

```yaml
category: true
values:
  - wood_wall
  - "#other:extra"
```

| Field | Type | Meaning |
|---|---|---|
| `values` | `string[]` | Entries and/or same-registry tags |
| `replace` | `boolean` | Default false = append across packs |
| `category` | `boolean` | Pack metadata flag used by bundu tags |

Registries with tags in bundu: `structure`, `resource`, `ground_type`,
`decoration`, `entity_type`.

Singular refs (e.g. `corpse`) reject tags; set fields (`aggroAt`,
`placement.ground`) accept them.

**Server** (projected to client registries where needed).

---

## Server `gameplay.yml`

**Defs:** `defs/<ns>/gameplay.yml` → `data/<ns>/gameplay.yml`  
Loaded via `packs.document("bundu", "gameplay")` — **server sim only**.

Top-level groups (snake_case in YAML → camelCase in `GameplayConfig`):

- `animal_ai` — think/path/aggro/wander/stuck timers
- `hunger`, `vitals`, `temperature`, `thirst`, `air` — damage / tick period
- `day_cycle.periods` — morning/day/evening/night durations + attribute mods
- `health`, `spikes`, `rotting` (`claim_weapon` item ref)
- `items` — pickup/drop radii
- `render_distance`
- `player` — spawn, collision, `base_attributes`, `initial_stats`, movement multipliers, hunger limits
- `worldgen` — resource/animal lists (tags/ids), starter structure

---

## Client: `client/gameplay.yml`, `stat_bars.yml`, `lang/`

**Defs:** `defs/<ns>/client/**` → `assets/<ns>/**` (no `---`).

| File | Role | Ownership |
|---|---|---|
| `client/gameplay.yml` | Shadows + ocean FX | **Client-only** (`parseClientGameplayConfig`) |
| `client/stat_bars.yml` | HUD bars: health, hunger, heat, thirst | **Client-only** |
| `client/lang/<code>.yml` | Names/descriptions | **Client** (Minecraft-style nested keys) |

Stat bar fields per bar: `max`, `split`, `icon`, `colors` (`base`/`overlay`/`diff`/
`flash_base`/`flash_overlay`), `shake`, optional `flash_below` / `flash_above` /
`flash_below_ratio`, optional `gradient: [{ at, base, overlay }]`.

Lang top-level groups in bundu: `item`, `structure`, `resource`, `ground_type`,
`decoration`, `menu`, … Keys flatten with namespace from the assets folder.

---

## Shared models (`defs/.../models/`)

Display-only abstracts / odd paths:

| Path | Model id pattern | Role |
|---|---|---|
| `models/base/rottable.yml`, `single_tile_node.yml` | `model:bundu:…` | Tile entity base |
| `models/actors/animal.yml` | `model:bundu:animal` | Animal visual defaults + footsteps |
| `models/walls/wall.yml`, `doors/door.yml` | `model:…` (abstract) | Wall/door graphs + spike/open states |
| `models/structures/fire.yml`, `structure.yml` | abstracts | Fires / generic |
| `models/corpses/corpse.yml` | abstract | Dead animal pose |
| `models/items/*` | often legacy/shared | Misc; prefer paired registry defs |
| `models/nature/tree.yml` | via `@pack-gen` + explicit `id` | Multi-tile forest tree |

### Model authoring surface (`ModelDef` / compile)

Common YAML: `extends`, `abstract`, `texture`, `parts`, `displays`, `variants`,
`defaultVariant`, `slots`, `animations`, `states`, `tile` (footprint/spillover),
`occlusion`, `alphaFadeMs`, `footsteps`.

Part fields: `sprite`, `parent`, pose (`x/y/scale/rotation/zIndex/pivot`),
`spriteScale`, `spillover`, `attach` / `attachAbove` / `attachAnchor`, `alpha`,
`visible`, `blendMode`, `skyUndo`, `shadow`.

Anim presets: `hurt`, `hit`, `place`, `wave`, `tree_sway`, `bob`, `lunge`,
`attack`, `spike_attack`, `block`, `eat`, `rotting`, `fire_glow`.

**Client** (compiled server-side into `models.json` for sync).

---

## What else is authored in packs?

| Asset | Where | Notes |
|---|---|---|
| Textures | `assets/<ns>/textures/**` | Not from `defs/`; SVG/PNG referenced as `ns/...` |
| Pack manifest | `pack.yml` | `id`, `format`, `version`, `depends` |
| Maps | repo `maps/` (not pack defs) | World layouts outside this catalog |
| Overlay packs | other `packs/<id>/` | Same `defs/` layout; later packs override by id |

---

## Likely missing from a short mental list

If you only think “Items, Swords, Helmets, Food, Books, Resources, Buildings,
Floors, Roofs, Fires, Crafting benches”, you are also missing:

1. **Item types** as separate templates (data + display), including `none`, tools, `wall`/`door`/`spike` visuals, `hat` vs `helmet`, `tree` world display  
2. **Placeable item ↔ structure** split (`places`, dual registries)  
3. **Doors, spikes, walls** as structure classes (not just “buildings”)  
4. **Point generators**, **anvil** (flag `near_anvil`), workbench flags  
5. **Entities/animals** + **corpses as resources**  
6. **Decorations** (biome clutter)  
7. **Ground types + ground models** (ocean/solid, overheat, footsteps/trail)  
8. **Recipes** and **loot tables** as first-class ids  
9. **Tags** (`#ns:path`)  
10. **Server gameplay.yml** vs **client gameplay / stat_bars / lang**  
11. **Shared model abstracts** under `models/`  
12. **Floors & roofs** — loader/occupancy support, but **no bundu content yet**  
13. **Backpacks**, medallions, scuba flags, books’ crafting flags  
14. **Textures** directory (manual)  
15. **Pool loot** (supported, unused in bundu)

---

## Client vs server cheat sheet

| Content | Server | Client |
|---|---|---|
| Item/structure/resource/entity/decoration/ground_type/recipe/loot/tag data | yes | curated projection only |
| Model / ground_model YAML | compile/sanitize | render |
| `defs/.../gameplay.yml` | sim | no |
| `client/gameplay.yml` | serve only | shadows/ocean |
| `stat_bars.yml`, `lang/` | serve | UI / text |
| Textures | sanitize/re-encode | draw |

---

## Quick checklist for a new placeable

1. `items/foo.yml` — display texture + `type: bundu:building` + `places: foo`  
2. `buildings/…/foo.yml` — `class` + health (+ contexts)  
3. `recipes/foo.yml` — if craftable  
4. `client/lang/en.yml` — `item.foo` / `structure.foo` names  
5. `bun run pack:gen` && `bun run validate:packs`
