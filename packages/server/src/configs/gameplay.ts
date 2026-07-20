import type { StatType } from "../components/stats";
import {
    AttributeList,
    type AttributeType,
} from "../components/attributes";
import type { EffectAttribute } from "./loaders/effect_context.js";

type Point = { x: number; y: number };
type StatConfig = { value: number; min: number; max: number };

export type GameplayConfig = {
    animalAi: {
        thinkIntervalMs: number;
        pathLimit: number;
        aggroCheckIntervalMs: number;
        aggroLostMs: number;
        aggroDropChancePercent: number;
        mediumAggroRangeRatio: number;
        wanderMinMs: number;
        wanderVarianceMs: number;
        fleeMs: number;
        clearanceStepTiles: number;
        /** Drop destination after this long with negligible movement. */
        stuckTimeoutMs: number;
    };
    hunger: {
        movingMultiplier: number;
        attackingMultiplier: number;
        starvationDamage: number;
    };
    /** Shared interval: apply rate attrs once every this many ms. */
    vitals: {
        tickPeriodMs: number;
    };
    temperature: {
        freezeDamage: number;
        overheatDamage: number;
    };
    thirst: {
        dehydrationDamage: number;
    };
    air: {
        drownDamage: number;
    };
    dayCycle: {
        periods: {
            name: "morning" | "day" | "evening" | "night";
            durationMs: number;
            attributes: Partial<Record<AttributeType, EffectAttribute>>;
        }[];
        totalDurationMs: number;
    };
    health: {
        regenIntervalMs: number;
        rottingDamageMultiplier: number;
        naturalLimit: number;
    };
    spikes: {
        attackIntervalMs: number;
        animalDamageMultiplier: number;
        damageMultiplierToSpike: number;
    };
    rotting: { damagePerSecond: number; claimWeapon: string };
    items: {
        pickupRadius: number;
        dropDistance: number;
        dropPickupDelayMs: number;
        groundCollisionRadius: number;
    };
    renderDistance: Point;
    player: {
        spawnTile: Point;
        collisionRadius: number;
        physicsSpeed: number;
        baseAttributes: Partial<Record<AttributeType, number>>;
        initialHealth: number;
        initialStats: Partial<Record<StatType, StatConfig>>;
        attackMovementMultiplier: number;
        attackMovementDurationMs: number;
        blockingMovementMultiplier: number;
        hungerSaturationLimit: number;
        hungerNormalLimit: number;
    };
    worldgen: {
        resourceCount: number;
        borderPaddingTiles: number;
        placementAttemptMultiplier: number;
        resources: string[];
        animals: string[];
        starterStructure: { id: string; x: number; y: number; rotation: number };
    };
};

function record(value: unknown, path: string): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`${path}: expected an object`);
    }
    return value as Record<string, unknown>;
}

function number(source: Record<string, unknown>, key: string, path: string): number {
    const value = source[key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`${path}.${key}: expected a finite number`);
    }
    return value;
}

function optionalNumber(
    source: Record<string, unknown>,
    key: string,
    path: string,
    fallback: number
): number {
    if (!(key in source) || source[key] === undefined) return fallback;
    return number(source, key, path);
}

function string(source: Record<string, unknown>, key: string, path: string): string {
    const value = source[key];
    if (typeof value !== "string" || !value) {
        throw new Error(`${path}.${key}: expected a non-empty string`);
    }
    return value;
}

function point(value: unknown, path: string): Point {
    const raw = record(value, path);
    return { x: number(raw, "x", path), y: number(raw, "y", path) };
}

function strings(value: unknown, path: string): string[] {
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
        throw new Error(`${path}: expected a string array`);
    }
    return value as string[];
}

function numberRecord(value: unknown, path: string): Record<string, number> {
    const raw = record(value, path);
    return Object.fromEntries(
        Object.keys(raw).map((key) => [key, number(raw, key, path)])
    );
}

function attributes(
    value: unknown,
    path: string
): Partial<Record<AttributeType, number>> {
    const values = numberRecord(value, path);
    for (const key of Object.keys(values)) {
        if (!AttributeList.includes(key as AttributeType)) {
            throw new Error(`${path}: unknown attribute "${key}"`);
        }
    }
    return values;
}

const ATTR_OPS = new Set(["add", "multiply"]);

function effectAttributes(
    value: unknown,
    path: string
): Partial<Record<AttributeType, EffectAttribute>> {
    if (value === undefined) return {};
    const raw = record(value, path);
    const result: Partial<Record<AttributeType, EffectAttribute>> = {};
    for (const [key, entry] of Object.entries(raw)) {
        if (!AttributeList.includes(key as AttributeType)) {
            throw new Error(`${path}: unknown attribute "${key}"`);
        }
        if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
            throw new Error(`${path}.${key}: expected { op, value }`);
        }
        const op = (entry as { op?: unknown }).op;
        const num = (entry as { value?: unknown }).value;
        if (typeof op !== "string" || !ATTR_OPS.has(op)) {
            throw new Error(`${path}.${key}.op: expected add|multiply`);
        }
        if (typeof num !== "number" || !Number.isFinite(num)) {
            throw new Error(`${path}.${key}.value: expected number`);
        }
        result[key as AttributeType] = {
            op: op as "add" | "multiply",
            value: num,
        };
    }
    return result;
}

const DAY_PERIOD_NAMES = ["morning", "day", "evening", "night"] as const;
type DayPeriodName = (typeof DAY_PERIOD_NAMES)[number];

/** Named morning/day/evening/night entries, ordered to match client sky tints. */
function parseDayCycle(
    value: Record<string, unknown>
): GameplayConfig["dayCycle"] {
    const path = "gameplay.day_cycle";
    const rawPeriods = record(value.periods, `${path}.periods`);
    const unexpected = Object.keys(rawPeriods).filter(
        (key) => !DAY_PERIOD_NAMES.includes(key as DayPeriodName)
    );
    if (unexpected.length > 0) {
        throw new Error(
            `${path}.periods: unknown period(s) ${unexpected.map((key) => `"${key}"`).join(", ")}`
        );
    }
    const periods = DAY_PERIOD_NAMES.map((name) => {
        const periodPath = `${path}.periods.${name}`;
        if (!(name in rawPeriods)) {
            throw new Error(`${periodPath}: missing period`);
        }
        const period = record(rawPeriods[name], periodPath);
        const durationMs = number(period, "duration_ms", periodPath);
        if (durationMs <= 0) {
            throw new Error(`${periodPath}.duration_ms: must be > 0`);
        }
        return {
            name,
            durationMs,
            attributes: effectAttributes(
                period.attributes,
                `${periodPath}.attributes`
            ),
        };
    });
    return {
        periods,
        totalDurationMs: periods.reduce((sum, period) => sum + period.durationMs, 0),
    };
}

export function parseGameplayConfig(value: unknown): GameplayConfig {
    const root = record(value, "gameplay");
    const animal = record(root.animal_ai, "gameplay.animal_ai");
    const hunger = record(root.hunger, "gameplay.hunger");
    const temperature = record(root.temperature, "gameplay.temperature");
    const thirst = record(root.thirst, "gameplay.thirst");
    const air = record(root.air, "gameplay.air");
    const dayCycle = record(root.day_cycle, "gameplay.day_cycle");
    const health = record(root.health, "gameplay.health");
    const spikes = record(root.spikes, "gameplay.spikes");
    const rotting = record(root.rotting, "gameplay.rotting");
    const items = record(root.items, "gameplay.items");
    const player = record(root.player, "gameplay.player");
    const initialStats = record(player.initial_stats, "gameplay.player.initial_stats");
    const stat = (name: StatType): StatConfig => {
        const raw = record(initialStats[name], `gameplay.player.initial_stats.${name}`);
        return {
            value: number(raw, "value", `gameplay.player.initial_stats.${name}`),
            min: number(raw, "min", `gameplay.player.initial_stats.${name}`),
            max: number(raw, "max", `gameplay.player.initial_stats.${name}`),
        };
    };
    const worldgen = record(root.worldgen, "gameplay.worldgen");
    const starter = record(worldgen.starter_structure, "gameplay.worldgen.starter_structure");
    return {
        animalAi: {
            thinkIntervalMs: number(animal, "think_interval_ms", "gameplay.animal_ai"),
            pathLimit: number(animal, "path_limit", "gameplay.animal_ai"),
            aggroCheckIntervalMs: number(animal, "aggro_check_interval_ms", "gameplay.animal_ai"),
            aggroLostMs: number(animal, "aggro_lost_ms", "gameplay.animal_ai"),
            aggroDropChancePercent: number(animal, "aggro_drop_chance_percent", "gameplay.animal_ai"),
            mediumAggroRangeRatio: number(animal, "medium_aggro_range_ratio", "gameplay.animal_ai"),
            wanderMinMs: number(animal, "wander_min_ms", "gameplay.animal_ai"),
            wanderVarianceMs: number(animal, "wander_variance_ms", "gameplay.animal_ai"),
            fleeMs: number(animal, "flee_ms", "gameplay.animal_ai"),
            clearanceStepTiles: number(animal, "clearance_step_tiles", "gameplay.animal_ai"),
            stuckTimeoutMs: number(animal, "stuck_timeout_ms", "gameplay.animal_ai"),
        },
        hunger: {
            movingMultiplier: number(hunger, "moving_multiplier", "gameplay.hunger"),
            attackingMultiplier: number(
                hunger,
                "attacking_multiplier",
                "gameplay.hunger"
            ),
            starvationDamage: number(hunger, "starvation_damage", "gameplay.hunger"),
        },
        vitals: (() => {
            const vitals = record(root.vitals, "gameplay.vitals");
            return {
                tickPeriodMs: number(
                    vitals,
                    "tick_period_ms",
                    "gameplay.vitals"
                ),
            };
        })(),
        temperature: {
            freezeDamage: number(temperature, "freeze_damage", "gameplay.temperature"),
            overheatDamage: number(
                temperature,
                "overheat_damage",
                "gameplay.temperature"
            ),
        },
        thirst: {
            dehydrationDamage: number(
                thirst,
                "dehydration_damage",
                "gameplay.thirst"
            ),
        },
        air: {
            drownDamage: number(air, "drown_damage", "gameplay.air"),
        },
        dayCycle: parseDayCycle(dayCycle),
        health: {
            regenIntervalMs: number(health, "regen_interval_ms", "gameplay.health"),
            rottingDamageMultiplier: number(
                health,
                "rotting_damage_multiplier",
                "gameplay.health"
            ),
            naturalLimit: optionalNumber(
                health,
                "natural_limit",
                "gameplay.health",
                100
            ),
        },
        spikes: {
            attackIntervalMs: number(spikes, "attack_interval_ms", "gameplay.spikes"),
            animalDamageMultiplier: number(
                spikes,
                "animal_damage_multiplier",
                "gameplay.spikes"
            ),
            damageMultiplierToSpike: number(
                spikes,
                "damage_multiplier_to_spike",
                "gameplay.spikes"
            ),
        },
        rotting: {
            damagePerSecond: number(rotting, "damage_per_second", "gameplay.rotting"),
            claimWeapon: string(rotting, "claim_weapon", "gameplay.rotting"),
        },
        items: {
            pickupRadius: number(items, "pickup_radius", "gameplay.items"),
            dropDistance: number(items, "drop_distance", "gameplay.items"),
            dropPickupDelayMs: number(items, "drop_pickup_delay_ms", "gameplay.items"),
            groundCollisionRadius: number(items, "ground_collision_radius", "gameplay.items"),
        },
        renderDistance: point(root.render_distance, "gameplay.render_distance"),
        player: {
            spawnTile: point(player.spawn_tile, "gameplay.player.spawn_tile"),
            collisionRadius: number(player, "collision_radius", "gameplay.player"),
            physicsSpeed: number(player, "physics_speed", "gameplay.player"),
            baseAttributes: attributes(
                player.base_attributes,
                "gameplay.player.base_attributes"
            ),
            initialHealth: number(player, "initial_health", "gameplay.player"),
            initialStats: {
                hunger: { ...stat("hunger") },
                temperature: { ...stat("temperature") },
                thirst: { ...stat("thirst") },
                air: { ...stat("air") },
            },
            attackMovementMultiplier: number(player, "attack_movement_multiplier", "gameplay.player"),
            attackMovementDurationMs: number(player, "attack_movement_duration_ms", "gameplay.player"),
            blockingMovementMultiplier: number(player, "blocking_movement_multiplier", "gameplay.player"),
            hungerSaturationLimit: number(player, "hunger_saturation_limit", "gameplay.player"),
            hungerNormalLimit: number(player, "hunger_normal_limit", "gameplay.player"),
        },
        worldgen: {
            resourceCount: number(worldgen, "resource_count", "gameplay.worldgen"),
            borderPaddingTiles: number(worldgen, "border_padding_tiles", "gameplay.worldgen"),
            placementAttemptMultiplier: number(worldgen, "placement_attempt_multiplier", "gameplay.worldgen"),
            resources: strings(worldgen.resources, "gameplay.worldgen.resources"),
            animals: strings(worldgen.animals, "gameplay.worldgen.animals"),
            starterStructure: {
                id: string(starter, "id", "gameplay.worldgen.starter_structure"),
                x: number(starter, "x", "gameplay.worldgen.starter_structure"),
                y: number(starter, "y", "gameplay.worldgen.starter_structure"),
                rotation: number(starter, "rotation", "gameplay.worldgen.starter_structure"),
            },
        },
    };
}

let config: GameplayConfig | undefined;

export function setGameplayConfig(value: unknown): void {
    config = parseGameplayConfig(value);
}

export function gameplayConfig(): GameplayConfig {
    if (!config) throw new Error("Gameplay config has not been loaded");
    return config;
}
