import { type ResourceConfig, ResourceConfigs } from "./resources.js";
import { getNumericId } from "@bundu/shared/id_map";
import { mergeObjects, mergeObjs } from "@bundu/shared";
import { type ItemConfig, ItemConfigs } from "./items.js";
import { type BuildingConfig, BuildingConfigs } from "./buildings.js";
import { type AnimalConfig, AnimalConfigs } from "./animals.js";
import { packs } from "../packs.js";
import { gameplayConfig, setGameplayConfig } from "../gameplay.js";
import { loadCraftingConfigs } from "./crafting.js";

/** Load configs that the server actually uses. */
export function loadConfigs() {
    setGameplayConfig(packs.document("bundu", "gameplay"));
    const buildingConfig = packs.records("bundu", "buildings");
    const animalConfig = packs.records("bundu", "entities");
    const resourceConfig = packs.records("bundu", "resources");
    const itemTypes = packs.records("bundu", "items/types");
    const consumableConfig = packs.records("bundu", "items/consumable");
    const mainhandConfig = packs.records("bundu", "items/main_hand");
    const offhandConfig = packs.records("bundu", "items/off_hand");
    const wearableConfig = packs.records("bundu", "items/wearable");
    const placeableConfig = packs.records("bundu", "items/placeable");
    const materialConfig = packs.records("bundu", "items/materials");

    const requireId = (id: string, path: string): number => {
        const numeric = getNumericId(id);
        if (numeric === undefined) throw new Error(`${path}: unknown id "${id}"`);
        return numeric;
    };
    const validateIds = (records: Record<string, unknown>, path: string) => {
        for (const id of Object.keys(records)) requireId(id, `${path}.${id}`);
    };
    validateIds(buildingConfig, "buildings");
    validateIds(animalConfig, "entities");
    validateIds(resourceConfig, "resources");

    loadCraftingConfigs(packs.records("bundu", "recipes"));
    BuildingConfigs.parse(
        buildingConfig as Record<string, Partial<BuildingConfig>>
    );
    AnimalConfigs.parse(
        animalConfig as Record<string, Partial<AnimalConfig>>,
        (id, record, fallback) => {
            const names = record.aggroAt as unknown as string[] | undefined;
            if (names) {
                record.aggroAt = names.map((name) =>
                    requireId(name, `entities.${id}.aggroAt`)
                );
            }
            return mergeObjects(record, undefined, fallback);
        }
    );

    ResourceConfigs.parse(
        resourceConfig as Record<string, Partial<ResourceConfig>>,
        (resource, record, fallback) => {
            const numericItems: Record<number, number> = {};

            if (!record.items) record.items = {};

            for (const [item, amount] of Object.entries(record.items)) {
                const id = requireId(item, `resources.${resource}.items`);
                numericItems[id] = amount;
            }

            record.items = numericItems;
            return mergeObjects(record, undefined, fallback);
        }
    );

    const types = itemTypes as Partial<Record<string, Partial<ItemConfig>>>;

    const typesCallback = (
        _id: string,
        record: Partial<ItemConfig>,
        fallback: ItemConfig
    ): ItemConfig => {
        const typeRecord = types[record.type ?? "none"] ?? fallback;

        record.attributes = mergeObjects(
            typeRecord.attributes,
            record.attributes,
            {}
        );
        record.stats = mergeObjects(typeRecord.stats, record.stats, {});
        record.flags = [...(typeRecord.flags ?? []), ...(record.flags ?? [])];

        return mergeObjects(typeRecord, record, fallback);
    };

    const itemConfigData = mergeObjs(
        consumableConfig,
        mainhandConfig,
        offhandConfig,
        wearableConfig,
        placeableConfig,
        materialConfig
    ) as Record<string, Partial<ItemConfig>>;
    validateIds(itemConfigData, "items");

    ItemConfigs.parse(itemConfigData, typesCallback);

    const gameplay = gameplayConfig();
    requireId(gameplay.rotting.claimWeapon, "gameplay.rotting.claim_weapon");
    for (const id of Object.keys(gameplay.temperature.nearFire.warmthByStructure)) {
        requireId(id, "gameplay.temperature.near_fire.warmth");
    }
    for (const id of gameplay.worldgen.resources) {
        requireId(id, "gameplay.worldgen.resources");
    }
    for (const id of gameplay.worldgen.animals) {
        requireId(id, "gameplay.worldgen.animals");
    }
    requireId(
        gameplay.worldgen.starterStructure.id,
        "gameplay.worldgen.starter_structure.id"
    );
}
