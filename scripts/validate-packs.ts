import { loadConfigs } from "../packages/server/src/configs/loaders/load";
import { packs } from "../packages/server/src/configs/packs";
import {
    gameRegistries,
    registrySources,
} from "../packages/server/src/configs/registries";
import { ResourcePackService } from "../packages/server/src/configs/resource_packs";
import {
    lookupContextVisual,
    lookupObjectDef,
    replaceCompiledVisualDefs,
    tileEntityDefs,
    visualDefs,
} from "../packages/client/src/visual/defs";

loadConfigs();
const resourcePacks = await ResourcePackService.create();
replaceCompiledVisualDefs(
    resourcePacks.compiledVisuals,
    resourcePacks.manifest.assets.map((asset) => asset.path)
);

function bareId(id: string): string {
    const index = id.indexOf(":");
    return index === -1 ? id : id.slice(index + 1);
}

function requireConcreteObjectVisual(id: string, kind: string): void {
    const def = visualDefs.get(id);
    if (!def || def.abstract || "contexts" in def) {
        throw new Error(
            `${kind} "${id}" needs its own concrete visual definition`
        );
    }
}

function requireBuildingVisual(id: string): void {
    if (tileEntityDefs.get(id) || lookupObjectDef(id) || lookupContextVisual(id)) {
        return;
    }
    throw new Error(
        `Building "${id}" needs a tile, object, or contextual visual definition`
    );
}

function requireItemVisual(id: string): void {
    if (lookupContextVisual(id) || lookupObjectDef(id) || lookupObjectDef(`item/${id}`)) {
        return;
    }
    throw new Error(
        `Item "${id}" needs a visual definition (item/${id} or contextual)`
    );
}

const sources = registrySources();
const resourceIds = [...sources.resource.keys()].map(bareId);
const entityIds = [...sources.entity_type.keys()].map(bareId);
const buildingIds = [...sources.structure.keys()].map(bareId);
const itemIds = [...sources.item.keys()].map(bareId);

for (const id of [...resourceIds, "stone_barrier"]) {
    requireConcreteObjectVisual(id, "Resource");
}
for (const id of entityIds) {
    requireConcreteObjectVisual(id, "Entity");
}
for (const id of buildingIds) {
    requireBuildingVisual(id);
}
for (const id of itemIds) {
    requireItemVisual(id);
}

const registryCounts = Object.entries(gameRegistries())
    .map(([name, registry]) => `${name}=${registry.size}`)
    .join(", ");
const recipeCount = sources.recipe.size;
const lootTableCount = sources.loot_table.size;

console.log(
    `Validated ${packs.packs.length} pack(s): ${packs.packs
        .map(({ manifest }) => `${manifest.id}@${manifest.version}`)
        .join(", ")} (${registryCounts}, recipes=${recipeCount}, loot_tables=${lootTableCount}, ${resourcePacks.manifest.assets.length} assets, ${resourcePacks.manifest.fingerprint.slice(0, 12)})`
);
