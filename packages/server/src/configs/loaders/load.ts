import { mergeObjects } from "@bundu/shared";
import type { RegistryId, RegistryName } from "@bundu/shared/registry";
import { type ResourceConfig, ResourceConfigs } from "./resources.js";
import { type ItemConfig, ItemConfigs } from "./items.js";
import { type BuildingConfig, BuildingConfigs } from "./buildings.js";
import { type AnimalConfig, AnimalConfigs } from "./animals.js";
import { type GroundTypeConfig, GroundTypeConfigs } from "./ground_types.js";
import { packs } from "../packs.js";
import { gameplayConfig, setGameplayConfig } from "../gameplay.js";
import { loadCraftingConfigs } from "./crafting.js";
import { loadLootTables } from "./loot_tables.js";
import {
    loadRegistries,
    registrySources,
    type GameRegistries,
    type RegistrySources,
} from "../registries.js";

function records<K extends RegistryName>(
    sources: RegistrySources[K]
): Record<string, unknown> {
    return Object.fromEntries(
        [...sources.entries()].map(([id, source]) => [id, source.value])
    );
}

function namespace(id: string): string {
    return id.slice(0, id.indexOf(":"));
}

function resolve<K extends RegistryName>(
    registries: GameRegistries,
    registry: K,
    value: string,
    owner: string,
    path: string
): RegistryId<K> {
    return registries[registry].resolve(value, namespace(owner), path);
}

/** Load configs that the server actually uses. */
export function loadConfigs() {
    const registries = loadRegistries();
    const sources = registrySources();
    setGameplayConfig(packs.document("bundu", "gameplay"));

    const buildingConfig = records(sources.structure);
    const animalConfig = records(sources.entity_type);
    const resourceConfig = records(sources.resource);
    const itemConfigData = records(sources.item) as Record<
        string,
        Partial<ItemConfig>
    >;
    const groundTypeConfig = records(sources.ground_type);
    const itemTypes = packs.records("bundu", "items/types") as Partial<
        Record<string, Partial<ItemConfig>>
    >;

    loadCraftingConfigs(sources.recipe);
    loadLootTables(sources.loot_table);
    BuildingConfigs.parse(
        buildingConfig as Record<string, Partial<BuildingConfig>>,
        (id, record, fallback) => {
            const raw = record as Partial<BuildingConfig> & {
                placement?: {
                    blocked?: unknown;
                    ground?: string[];
                };
            };
            const blocked = raw.placement?.blocked ?? [[0, 0]];
            if (
                !Array.isArray(blocked) ||
                blocked.some(
                    (cell) =>
                        !Array.isArray(cell) ||
                        cell.length !== 2 ||
                        !Number.isSafeInteger(cell[0]) ||
                        !Number.isSafeInteger(cell[1])
                )
            ) {
                throw new Error(`${id}.placement.blocked: expected [x, y][]`);
            }
            record.placement = {
                blocked: blocked.map((cell) => {
                    const [x, y] = cell as [number, number];
                    return { x, y };
                }),
                ground: registries.ground_type.resolveSet(
                    raw.placement?.ground ?? ["#bundu:buildable_ground"],
                    namespace(id),
                    `${id}.placement.ground`
                ),
            };
            return mergeObjects(record, undefined, fallback);
        }
    );
    GroundTypeConfigs.parse(
        groundTypeConfig as Record<string, Partial<GroundTypeConfig>>
    );
    AnimalConfigs.parse(
        animalConfig as Record<string, Partial<AnimalConfig>>,
        (id, record, fallback) => {
            const raw = record as Partial<AnimalConfig> & {
                aggroAt?: string[];
                corpse?: string;
            };
            record.aggroAt = registries.structure.resolveSet(
                raw.aggroAt ?? [],
                namespace(id),
                `${id}.aggroAt`
            ) as RegistryId<"structure">[];
            if (raw.corpse) {
                record.corpse = resolve(
                    registries,
                    "resource",
                    raw.corpse,
                    id,
                    `${id}.corpse`
                );
            }
            return mergeObjects(record, undefined, fallback);
        }
    );

    ResourceConfigs.parse(
        resourceConfig as Record<string, Partial<ResourceConfig>>,
        (resource, record, fallback) => {
            const raw = record as Partial<ResourceConfig> & {
                loot_table?: string;
            };
            if (
                record.quantity !== undefined &&
                (!Number.isSafeInteger(record.quantity) || record.quantity < 0)
            ) {
                throw new Error(`${resource}.quantity: expected a non-negative integer`);
            }
            if (raw.loot_table) {
                record.lootTable = resolve(
                    registries,
                    "loot_table",
                    raw.loot_table,
                    resource,
                    `${resource}.loot_table`
                );
            }
            return mergeObjects(record, undefined, fallback);
        }
    );

    const typesCallback = (
        id: string,
        record: Partial<ItemConfig>,
        fallback: ItemConfig
    ): ItemConfig => {
        const raw = record as Partial<ItemConfig> & { places?: string };
        const typeRecord = itemTypes[record.type ?? "none"] ?? fallback;

        record.attributes = mergeObjects(
            typeRecord.attributes,
            record.attributes,
            {}
        );
        record.stats = mergeObjects(typeRecord.stats, record.stats, {});
        record.flags = [...(typeRecord.flags ?? []), ...(record.flags ?? [])];
        if (raw.places) {
            record.places = resolve(
                registries,
                "structure",
                raw.places,
                id,
                `${id}.places`
            );
        }
        return mergeObjects(typeRecord, record, fallback);
    };

    ItemConfigs.parse(itemConfigData, typesCallback);

    const gameplay = gameplayConfig();
    registries.item.resolve(
        gameplay.rotting.claimWeapon,
        "bundu",
        "gameplay.rotting.claim_weapon"
    );
    for (const id of Object.keys(gameplay.temperature.nearFire.warmthByStructure)) {
        registries.structure.resolve(
            id,
            "bundu",
            "gameplay.temperature.near_fire.warmth"
        );
    }
    registries.resource.resolveSet(
        gameplay.worldgen.resources,
        "bundu",
        "gameplay.worldgen.resources"
    );
    registries.entity_type.resolveSet(
        gameplay.worldgen.animals,
        "bundu",
        "gameplay.worldgen.animals"
    );
    registries.structure.resolve(
        gameplay.worldgen.starterStructure.id,
        "bundu",
        "gameplay.worldgen.starter_structure.id"
    );
}
