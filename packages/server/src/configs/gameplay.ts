import type { StatType } from "../components/stats";
import {
    AttributeList,
    type AttributeType,
} from "../components/attributes";

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
    };
    hunger: {
        drainPeriodMs: number;
        movingMultiplier: number;
        attackingMultiplier: number;
    };
    temperature: {
        tickPeriodMs: number;
    };
    health: { regenIntervalMs: number; rottingDamageMultiplier: number };
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

export function parseGameplayConfig(value: unknown): GameplayConfig {
    const root = record(value, "gameplay");
    const animal = record(root.animal_ai, "gameplay.animal_ai");
    const hunger = record(root.hunger, "gameplay.hunger");
    const temperature = record(root.temperature, "gameplay.temperature");
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
        },
        hunger: {
            drainPeriodMs: number(hunger, "drain_period_ms", "gameplay.hunger"),
            movingMultiplier: number(hunger, "moving_multiplier", "gameplay.hunger"),
            attackingMultiplier: number(hunger, "attacking_multiplier", "gameplay.hunger"),
        },
        temperature: {
            tickPeriodMs: number(
                temperature,
                "tick_period_ms",
                "gameplay.temperature"
            ),
        },
        health: {
            regenIntervalMs: number(health, "regen_interval_ms", "gameplay.health"),
            rottingDamageMultiplier: number(health, "rotting_damage_multiplier", "gameplay.health"),
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
                hunger: stat("hunger"),
                temperature: stat("temperature"),
                water: stat("water"),
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
