import { ConfigLoader } from "./loader.js";

export type AnimalBehavior = "hostile" | "neutral" | "passive" | "scared";

export type AnimalConfig = {
    behavior: AnimalBehavior;
    health: number;
    /** Detection/retention distance in world units. */
    detectionRange: number;
    loseSightRange: number;
    /** World units per 20 TPS tick; matches PLAYER_MOVE_SPEED. */
    passiveSpeed: number;
    activeSpeed: number;
    collision_radius: number;
    wander_distance: number;
    attack_damage: number;
    attack_interval_ms: number;
    attack_reach: number;
    corpse: string;
    spawn_count: number;
};

export const AnimalConfigs = new ConfigLoader<AnimalConfig>({
    behavior: "passive",
    health: 100,
    detectionRange: 300,
    loseSightRange: 450,
    passiveSpeed: 4,
    activeSpeed: 6,
    collision_radius: 35,
    wander_distance: 300,
    attack_damage: 0,
    attack_interval_ms: 1000,
    attack_reach: 65,
    corpse: "deer_dead",
    spawn_count: 0,
});
