import { ConfigLoader } from "./loader.js";

export type AnimalBehavior = "hostile" | "neutral" | "passive" | "scared";
export type AggroSwitch = "never" | "onHit" | "random";
export type AggroLevel = "high" | "medium" | "low";

export type AnimalConfig = {
    score: number;
    behavior: AnimalBehavior;
    health: number;
    /** Detection/retention distance in world units. */
    detectionRange: number;
    loseSightRange: number;
    /** World units per 20 TPS tick; matches PLAYER_MOVE_SPEED. */
    passiveSpeed: number;
    activeSpeed: number;
    /**
     * Size in tiles: 1 → diameter = 1 tile (collision radius TILE_SIZE/2)
     * and client visual root TILE_SIZE. Identity = 1.
     */
    scale: number;
    /** When true, idle roam alternates homeward and wander sessions. */
    hasHome: boolean;
    wander_distance: number;
    attack_damage: number;
    attack_interval_ms: number;
    /**
     * Seed for `attack.reach` attribute (world units past body radius).
     * Effective reach = attack_reach + collisionRadius.
     */
    attack_reach: number;
    /**
     * How aggro retargets when other players interact.
     * - never: keep current target
     * - onHit: switch to the latest attacker
     * - random: periodically pick a random in-range player
     */
    aggroSwitch: AggroSwitch;
    /**
     * How locked-on the animal stays.
     * - high: stay aggroed while in loseSightRange
     * - medium: periodic chance to drop if past halfway to loseSightRange
     * - low: periodic chance to drop at any range
     * Drops last 1s before the animal can target again.
     */
    aggroLevel: AggroLevel;
    /**
     * Structure type ids the animal will chase/attack when no player target
     * is available. YAML lists string ids; loader resolves to numeric ids.
     */
    aggroAt: number[];
    corpse: string;
    spawn_count: number;
};

export const AnimalConfigs = new ConfigLoader<AnimalConfig>({
    score: 0,
    behavior: "passive",
    health: 100,
    detectionRange: 300,
    loseSightRange: 450,
    passiveSpeed: 4,
    activeSpeed: 6,
    scale: 1,
    hasHome: true,
    wander_distance: 300,
    attack_damage: 0,
    attack_interval_ms: 1000,
    attack_reach: 65,
    aggroSwitch: "never",
    aggroLevel: "high",
    aggroAt: [],
    corpse: "deer_dead",
    spawn_count: 0,
});
