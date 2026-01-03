import { ConfigLoader } from "./loader.js";

export type BuildingConfig = {
    class?: string;

    health: number;

    touch_damage: number;
    hit_damage: number;

    flags_nearby: string[];
    flags_touching: string[];

    nearby_distance: number;
};

const fallback: BuildingConfig = {
    health: 50,
    touch_damage: 0,
    hit_damage: 0,
    flags_nearby: [],
    flags_touching: [],
    nearby_distance: 100,
};

export const BuildingConfigs = new ConfigLoader<BuildingConfig>(fallback);
