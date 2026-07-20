import { modelIdForLocation } from "../packages/shared/src/models/ids";
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

function requireConcreteAssembledModel(modelId: string, kind: string): void {
    const def = modelDefs.get(modelId);
    if (!def || def.abstract || !modelHasParts(def)) {
        throw new Error(
            `${kind} "${modelId}" needs its own concrete assembled model definition`
        );
    }
}

function requireBuildingModel(location: string): void {
    const structureId = modelIdForLocation("structure", location);
    const itemId = modelIdForLocation("item", location);
    // Placeables may share the item display when no dedicated structure model exists
    // (e.g. anvil/workbench); spikes often piggyback on wall models.
    if (
        tileEntityDefs.get(structureId) ||
        lookupObjectDef(structureId) ||
        lookupModel(structureId) ||
        lookupModel(itemId)
    ) {
        return;
    }
    throw new Error(
        `Building "${location}" needs a structure or item model (${structureId} / ${itemId})`
    );
}

function requireItemModel(location: string): void {
    const id = modelIdForLocation("item", location);
    if (lookupModel(id) || lookupObjectDef(id)) {
        return;
    }
    throw new Error(`Item "${location}" needs a model definition (${id})`);
}

function requireDecorationModel(location: string): void {
    const id = modelIdForLocation("decoration", location);
    if (lookupObjectDef(id)) return;
    throw new Error(
        `Decoration "${location}" needs a concrete assembled model (${id})`
    );
}

const sources = registrySources();
const resourceLocations = [...sources.resource.keys()];
const entityLocations = [...sources.entity_type.keys()];
const buildingLocations = [...sources.structure.keys()];
const itemLocations = [...sources.item.keys()];
const decorationLocations = [...sources.decoration.keys()];

for (const location of resourceLocations) {
    requireConcreteAssembledModel(
        modelIdForLocation("resource", location),
        "Resource"
    );
}
// Hardcoded barrier used by map tooling.
requireConcreteAssembledModel(
    modelIdForLocation("resource", "bundu:stone_barrier"),
    "Resource"
);
for (const location of entityLocations) {
    requireConcreteAssembledModel(
        modelIdForLocation("entity_type", location),
        "Entity"
    );
}
for (const location of buildingLocations) {
    requireBuildingModel(location);
}
for (const location of itemLocations) {
    requireItemModel(location);
}
for (const location of decorationLocations) {
    requireDecorationModel(location);
}

const registryCounts = Object.entries(gameRegistries())
    .map(([name, registry]) => `${name}=${registry.size}`)
    .join(", ");

console.log(
    `Pack validation passed (${resourcePacks.manifest.packs.map((pack) => pack.id).join(", ")}; ${registryCounts}; ${resourcePacks.manifest.assets.length} textures).`
);
