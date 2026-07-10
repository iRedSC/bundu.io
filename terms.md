# Terms

Glossary for world space, tiles, and physical game objects.

## Units

- **tile** — Discrete cell on the world grid. One tile is `100×100` world units.
- **TILE_SIZE** — World units per tile edge. Fixed at `100`.
- **decitile** — Quantized position unit: `1/10` of a tile. Authoritative positions and packets use integer decitiles (`tile * 10`).
- **world unit** — Continuous render/physics space. `1` world unit maps 1:1 to Pixi pixels at zoom 1. `100` world units = `1` tile.

## Entities

- **entity** — Game object with physical properties (position, rotation, collision, etc.).
- **tile entity** — Entity defined on the tile grid: integer tile origin, discrete rotation, and a footprint of relative blocked tiles. Resources and placed structures are tile entities.
- **mover** — Entity with a quantized (decitile) position that moves over time (e.g. the player). Not snapped to integer tiles.

## Tile entities

- **origin** — The integer tile used as the tile entity’s placement anchor and rotation pivot.
- **rotation** — Discrete facing for tile entities: `0° / 90° / 180° / 270°` only.
- **blocked tiles** / **footprint** — Integer tile offsets relative to origin (before rotation) that the tile entity occupies. After rotation + translation, these become world occupancy.
- **solid footprint** — Occupancy rule: each world tile may be solid-occupied by at most one tile entity.

## Collision

- **occupancy grid** — Map from world tile → tile entity id. Source of truth for solid statics and placement checks.
- **footprint circle** — Circle collider centered on an occupied tile (radius ≤ half a tile). Static solid collision is player/mover circle vs these circles, not vs square AABBs.
- **player visual radius** — Half of `TILE_SIZE` (`50`). When centered on a tile, the visual touches that tile’s edges.
- **player hitbox** — Circle slightly smaller than the visual radius so edge collisions feel fair.

## Ground

- **ground** — Axis-aligned region in tile coordinates (AABB). Not a tile entity; not part of the solid footprint / occupancy grid.

## Art

- **tile art scale** — Structure art is authored at `100×100` pixels per tile. A footprint whose axis-aligned bbox is `N×M` tiles uses art sized `(N*100)×(M*100)`, positioned via origin and rotation.
