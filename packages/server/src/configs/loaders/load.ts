import { mergeObjects } from "@bundu/shared";
import type { RegistryId, RegistryName } from "@bundu/shared/registry";
import { type ResourceConfig, ResourceConfigs } from "./resources.js";
import { type ItemConfig, ItemConfigs } from "./items.js";
import {
    type BuildingClass,
    type BuildingConfig,
    BuildingConfigs,
    defaultSolidForClass,
} from "./buildings.js";
import { type AnimalConfig, AnimalConfigs } from "./animals.js";
import { type GroundTypeConfig, GroundTypeConfigs } from "./ground_types.js";
import { type DecorationConfig, DecorationConfigs } from "./decorations.js";
import {
    EQUIP_CONTEXTS,
    parseEffectContext,
    SPATIAL_CONTEXTS,
    type ContextName,
} from "./effect_context.js";
import { packs } from "../packs.js";
import { gameplayConfig, setGameplayConfig } from "../gameplay.js";
import { resetFlagRegistry } from "../flag_registry.js";
import { loadCraftingConfigs } from "./crafting.js";
import { loadLootTables } from "./loot_tables.js";
import {
    loadRegistries,
    registrySources,
    type GameRegistries,
    type RegistrySources,
} from "../registries.js";

const CONTEXT_META = new Set([
    "stack",
    "proximityDistance",
    "occupationType",
]);

function asObject(value: unknown): Record<string, unknown> | undefined {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return undefined;
    }
    return value as Record<string, unknown>;
}

/** Deep-merge when* YAML (meta keys + per-target hide/attributes). */
function mergeRawContext(
    base: unknown,
    override: unknown
): Record<string, unknown> | undefined {
    const baseObj = asObject(base);
    const overObj = asObject(override);
    if (!baseObj && !overObj) return undefined;
    if (!baseObj) return { ...overObj };
    if (!overObj) return { ...baseObj };

    const keys = new Set([...Object.keys(baseObj), ...Object.keys(overObj)]);
    const result: Record<string, unknown> = {};
    for (const key of keys) {
        if (CONTEXT_META.has(key)) {
            result[key] =
                overObj[key] !== undefined ? overObj[key] : baseObj[key];
            continue;
        }
        const baseTarget = asObject(baseObj[key]);
        const overTarget = asObject(overObj[key]);
        if (!baseTarget) {
            result[key] = overTarget ? { ...overTarget } : overObj[key];
            continue;
        }
        if (!overTarget) {
            result[key] = { ...baseTarget };
            continue;
        }
        const baseAttrs = asObject(baseTarget.attributes) ?? {};
        const overAttrs = asObject(overTarget.attributes) ?? {};
        const baseFlags = Array.isArray(baseTarget.flags)
            ? (baseTarget.flags as string[])
            : [];
        const overFlags = Array.isArray(overTarget.flags)
            ? (overTarget.flags as string[])
            : [];
        const flags = [...baseFlags];
        for (const flag of overFlags) {
            if (!flags.includes(flag)) flags.push(flag);
        }
        result[key] = {
            hide:
                overTarget.hide !== undefined
                    ? overTarget.hide
                    : baseTarget.hide,
            attributes: { ...baseAttrs, ...overAttrs },
            ...(flags.length > 0 ? { flags } : {}),
        };
    }
    return result;
}

function assignContexts(
    record: Record<string, unknown>,
    raw: Record<string, unknown>,
    typeRaw: Record<string, unknown> | undefined,
    path: string,
    registries: GameRegistries,
    ownerId: string,
    allowed: readonly ContextName[]
): void {
    for (const name of allowed) {
        const merged = mergeRawContext(typeRaw?.[name], raw[name]);
        if (merged === undefined) continue;
        record[name] = parseEffectContext(
            merged,
            `${path}.${name}`,
            name,
            registries,
            ownerId
        );
    }
}

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

/** `undefined` = field omitted (allow all). Present array (incl. empty) is kept. */
function optionalResolveSet<K extends RegistryName>(
    registries: GameRegistries,
    registry: K,
    value: unknown,
    owner: string,
    path: string
): readonly RegistryId<K>[] | undefined {
    if (value === undefined) return undefined;
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
        throw new Error(`${path}: expected string[]`);
    }
    return registries[registry].resolveSet(
        value,
        namespace(owner),
        path
    );
}

const BUILDING_CLASSES = new Set<BuildingClass>([
    "building",
    "door",
    "spike",
    "wall",
    "floor",
    "roof",
]);

function parsePlacementAllowDeny(
    registries: GameRegistries,
    owner: string,
    raw: Record<string, unknown>
): {
    allowedStructures?: readonly RegistryId<"structure">[];
    deniedStructures?: readonly RegistryId<"structure">[];
    allowedRoofs?: readonly RegistryId<"structure">[];
    deniedRoofs?: readonly RegistryId<"structure">[];
    allowedFloors?: readonly RegistryId<"structure">[];
    deniedFloors?: readonly RegistryId<"structure">[];
    allowedResources?: readonly RegistryId<"resource">[];
    deniedResources?: readonly RegistryId<"resource">[];
} {
    return {
        allowedStructures: optionalResolveSet(
            registries,
            "structure",
            raw.allowedStructures,
            owner,
            `${owner}.allowedStructures`
        ),
        deniedStructures: optionalResolveSet(
            registries,
            "structure",
            raw.deniedStructures,
            owner,
            `${owner}.deniedStructures`
        ),
        allowedRoofs: optionalResolveSet(
            registries,
            "structure",
            raw.allowedRoofs,
            owner,
            `${owner}.allowedRoofs`
        ),
        deniedRoofs: optionalResolveSet(
            registries,
            "structure",
            raw.deniedRoofs,
            owner,
            `${owner}.deniedRoofs`
        ),
        allowedFloors: optionalResolveSet(
            registries,
            "structure",
            raw.allowedFloors,
            owner,
            `${owner}.allowedFloors`
        ),
        deniedFloors: optionalResolveSet(
            registries,
            "structure",
            raw.deniedFloors,
            owner,
            `${owner}.deniedFloors`
        ),
        allowedResources: optionalResolveSet(
            registries,
            "resource",
            raw.allowedResources,
            owner,
            `${owner}.allowedResources`
        ),
        deniedResources: optionalResolveSet(
            registries,
            "resource",
            raw.deniedResources,
            owner,
            `${owner}.deniedResources`
        ),
    };
}

/** Load configs that the server actually uses. */
export function loadConfigs() {
    resetFlagRegistry();
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
    const decorationConfig = records(sources.decoration);
    const itemTypes = packs.records("bundu", "item_types") as Partial<
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
                solid?: unknown;
                class?: unknown;
            } & Record<string, unknown>;
            const buildingClass = raw.class ?? fallback.class;
            if (
                typeof buildingClass !== "string" ||
                !BUILDING_CLASSES.has(buildingClass as BuildingClass)
            ) {
                throw new Error(
                    `${id}.class: expected one of ${[...BUILDING_CLASSES].join(", ")}`
                );
            }
            record.class = buildingClass as BuildingClass;
            if (raw.solid !== undefined && typeof raw.solid !== "boolean") {
                throw new Error(`${id}.solid: expected boolean`);
            }
            record.solid =
                typeof raw.solid === "boolean"
                    ? raw.solid
                    : defaultSolidForClass(record.class);
            assignContexts(
                record as Record<string, unknown>,
                raw,
                undefined,
                id,
                registries,
                id,
                SPATIAL_CONTEXTS
            );
            Object.assign(record, parsePlacementAllowDeny(registries, id, raw));
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
        groundTypeConfig as Record<string, Partial<GroundTypeConfig>>,
        (id, record, fallback) => {
            const raw = record as Record<string, unknown>;
            assignContexts(
                record as Record<string, unknown>,
                raw,
                undefined,
                id,
                registries,
                id,
                ["whenOccupied"]
            );
            return mergeObjects(record, undefined, fallback);
        }
    );
    DecorationConfigs.parse(
        decorationConfig as Record<string, Partial<DecorationConfig>>,
        (id, record, fallback) => {
            if (
                record.size !== undefined &&
                (!Number.isFinite(record.size) || record.size <= 0)
            ) {
                throw new Error(`${id}.size: expected a positive number`);
            }
            if (
                record.z !== undefined &&
                (!Number.isFinite(record.z) || !Number.isSafeInteger(record.z))
            ) {
                throw new Error(`${id}.z: expected a safe integer`);
            }
            return mergeObjects(record, undefined, fallback);
        }
    );
    const animalsOnly = Object.fromEntries(
        Object.entries(animalConfig).filter(([id, value]) => {
            const bare = id.includes(":") ? id.slice(id.indexOf(":") + 1) : id;
            if (bare === "player") return false;
            if (
                value &&
                typeof value === "object" &&
                (value as { kind?: unknown }).kind === "player"
            ) {
                return false;
            }
            return true;
        })
    );
    AnimalConfigs.parse(
        animalsOnly as Record<string, Partial<AnimalConfig>>,
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
                solid?: unknown;
            } & Record<string, unknown>;
            if (
                record.quantity !== undefined &&
                (!Number.isSafeInteger(record.quantity) || record.quantity < 0)
            ) {
                throw new Error(`${resource}.quantity: expected a non-negative integer`);
            }
            if (raw.solid !== undefined && typeof raw.solid !== "boolean") {
                throw new Error(`${resource}.solid: expected boolean`);
            }
            if (typeof raw.solid === "boolean") {
                record.solid = raw.solid;
            }
            Object.assign(
                record,
                parsePlacementAllowDeny(registries, resource, raw)
            );
            assignContexts(
                record as Record<string, unknown>,
                raw,
                undefined,
                resource,
                registries,
                resource,
                SPATIAL_CONTEXTS
            );
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

    const itemTypeRaws = itemTypes as Record<string, Record<string, unknown>>;

    const typesCallback = (
        id: string,
        record: Partial<ItemConfig>,
        fallback: ItemConfig
    ): ItemConfig => {
        const raw = record as Partial<ItemConfig> & {
            places?: string;
        } & Record<string, unknown>;
        const typeKey = record.type ?? "none";
        const typeRaw = itemTypeRaws[typeKey] ?? {};
        const typeRecord = typeRaw as Partial<ItemConfig>;

        record.stats = mergeObjects(typeRecord.stats, record.stats, {});
        if (raw.places) {
            record.places = resolve(
                registries,
                "structure",
                raw.places,
                id,
                `${id}.places`
            );
        }
        assignContexts(
            record as Record<string, unknown>,
            raw,
            typeRaw,
            id,
            registries,
            id,
            EQUIP_CONTEXTS
        );
        // Merge type fields but keep parsed contexts from `record`.
        const merged = mergeObjects(typeRecord, record, fallback);
        for (const name of EQUIP_CONTEXTS) {
            merged[name] = record[name];
        }
        return merged;
    };

    ItemConfigs.parse(itemConfigData, typesCallback);

    const gameplay = gameplayConfig();
    registries.item.resolve(
        gameplay.rotting.claimWeapon,
        "bundu",
        "gameplay.rotting.claim_weapon"
    );
    registries.entity_type.resolve(
        "player",
        "bundu",
        "entity_type.player"
    );
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
