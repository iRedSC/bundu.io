import { loadConfigs } from "../packages/server/src/configs/loaders/load";
import { packs } from "../packages/server/src/configs/packs";
import { resourcePacks } from "../packages/server/src/configs/resource_packs";
import {
    replaceVisualDefs,
    visualDefs,
} from "../packages/client/src/visual/defs";

loadConfigs();
replaceVisualDefs(
    JSON.parse(resourcePacks.visualsJson) as Record<string, unknown>,
    resourcePacks.manifest.assets.map((asset) => asset.path)
);
for (const id of [
    ...Object.keys(packs.records("bundu", "resources")),
    "stone_barrier",
]) {
    const def = visualDefs.get(id);
    if (!def || def.abstract || "contexts" in def) {
        throw new Error(`Resource "${id}" needs its own concrete visual definition`);
    }
}
console.log(
    `Validated ${packs.packs.length} pack(s): ${packs.packs
        .map(({ manifest }) => `${manifest.id}@${manifest.version}`)
        .join(", ")} (${resourcePacks.manifest.assets.length} assets, ${resourcePacks.manifest.fingerprint.slice(0, 12)})`
);
