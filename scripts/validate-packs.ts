import { loadConfigs } from "../packages/server/src/configs/loaders/load";
import {
    gameRegistries,
    registrySources,
} from "../packages/server/src/configs/registries";
import { ResourcePackService } from "../packages/server/src/configs/resource_packs";
import {
    lookupModel,
    lookupObjectDef,
    replaceCompiledModelDefs,
    tileEntityDefs,
    modelDefs,
} from "../packages/client/src/models/defs";
import { modelHasParts } from "../packages/client/src/models/types";

loadConfigs();
const resourcePacks = await ResourcePackService.create();
replaceCompiledModelDefs(
    resourcePacks.compiledModels,
    resourcePacks.manifest.assets.map((asset) => asset.path)
);

function bareId(id: string): string {
    const index = id.indexOf(":");
    return index === -1 ? id : id.slice(index + 1);
}

function requireConcreteAssembledModel(id: string, kind: string): void {
    const def = modelDefs.get(id);
    if (!def || def.abstract || !modelHasParts(def)) {
        throw new Error(
            `${kind} "${id}" needs its own concrete assembled model definition`
        );
    }
}

function requireBuildingModel(id: string): void {
    if (tileEntityDefs.get(id) || lookupObjectDef(id) || lookupModel(id)) {
        return;
    }
    throw new Error(
        `Building "${id}" needs a tile, assembled, or display model definition`
    );
}

function requireItemModel(id: string): void {
    if (lookupModel(id) || lookupObjectDef(id) || lookupObjectDef(`item/${id}`)) {
        return;
    }
    throw new Error(
        `Item "${id}" needs a model definition (item/${id} or assembled)`
    );
}

const sources = registrySources();
const resourceIds = [...sources.resource.keys()].map(bareId);
const entityIds = [...sources.entity_type.keys()].map(bareId);
const buildingIds = [...sources.structure.keys()].map(bareId);
const itemIds = [...sources.item.keys()].map(bareId);

for (const id of [...resourceIds, "stone_barrier"]) {
    requireConcreteAssembledModel(id, "Resource");
}
for (const id of entityIds) {
    requireConcreteAssembledModel(id, "Entity");
}
for (const id of buildingIds) {
    requireBuildingModel(id);
}
for (const id of itemIds) {
    requireItemModel(id);
}

const registryCounts = Object.entries(gameRegistries())
    .map(([name, registry]) => `${name}=${registry.size}`)
    .join(", ");

console.log(
    `Pack validation passed (${resourcePacks.manifest.packs.map((pack) => pack.id).join(", ")}; ${registryCounts}; ${resourcePacks.manifest.assets.length} textures).`
);
