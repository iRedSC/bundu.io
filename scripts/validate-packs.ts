import { loadConfigs } from "../packages/server/src/configs/loaders/load";
import { packs } from "../packages/server/src/configs/packs";
import { resourcePacks } from "../packages/server/src/configs/resource_packs";
import {
    lookupContextVisual,
    lookupObjectDef,
    replaceVisualDefs,
    tileEntityDefs,
    visualDefs,
} from "../packages/client/src/visual/defs";

loadConfigs();
replaceVisualDefs(
    JSON.parse(resourcePacks.visualsJson) as Record<string, unknown>,
    resourcePacks.manifest.assets.map((asset) => asset.path)
);

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

const resourceIds = Object.keys(packs.records("bundu", "resources"));
const entityIds = Object.keys(packs.records("bundu", "entities"));
const buildingIds = Object.keys(packs.records("bundu", "buildings"));
const itemIds = Object.keys(
    Object.assign(
        {},
        packs.records("bundu", "items/consumable"),
        packs.records("bundu", "items/main_hand"),
        packs.records("bundu", "items/off_hand"),
        packs.records("bundu", "items/wearable"),
        packs.records("bundu", "items/placeable"),
        packs.records("bundu", "items/materials")
    )
);

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

console.log(
    `Validated ${packs.packs.length} pack(s): ${packs.packs
        .map(({ manifest }) => `${manifest.id}@${manifest.version}`)
        .join(", ")} (${resourceIds.length} resources, ${entityIds.length} entities, ${buildingIds.length} buildings, ${itemIds.length} items, ${resourcePacks.manifest.assets.length} assets, ${resourcePacks.manifest.fingerprint.slice(0, 12)})`
);
