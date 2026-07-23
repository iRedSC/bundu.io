# Entities

Animals and other actors in the world. Stats below are from the base `bundu` pack — treat as a snapshot.

## Wildlife

<div class="catalog">
  <div class="catalog-card">
    <img src="/entities/deer.svg" alt="Deer" />
    <strong>Deer</strong>
    <code>bundu:deer</code>
    <p>Scared prey. Low threat, useful loot.</p>
  </div>
  <div class="catalog-card">
    <img src="/entities/bee.svg" alt="Bee" />
    <strong>Bee</strong>
    <code>bundu:bee</code>
    <p>Hostile, fast. Light hits, annoying packs.</p>
  </div>
  <div class="catalog-card">
    <img src="/entities/bear.svg" alt="Bear" />
    <strong>Bear</strong>
    <code>bundu:bear</code>
    <p>Hostile tank. High damage — respect the aggro range.</p>
  </div>
  <div class="catalog-card">
    <img src="/entities/elephant.svg" alt="Elephant" />
    <strong>Elephant</strong>
    <code>bundu:elephant</code>
    <p>Big land animal. Heavy presence on the map.</p>
  </div>
</div>

## Behavior cheat-sheet

| Entity | Behavior | Rough vibe |
|---|---|---|
| Deer | scared | Runs away |
| Bee | hostile | Fast, low aggro level |
| Bear | hostile | Medium aggro, wall-aware |
| Elephant | (see pack) | Large target |

Corpses drop materials (hide, meat, specialty parts). Exact loot tables live in pack `loot_tables/`.

## Authoring tip

Entity defs are paired YAML: display model first, gameplay data after `---`. See [Packs](/authoring/packs).
