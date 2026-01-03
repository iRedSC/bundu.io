import { ConfigLoader } from "./loader.js";

export type EntityConfig = {
    anger: number;
    speed: number;
    attack_damage: number;
    size: number;
    wander_range: number;
    rest_time: number;
};

const fallback = {
    anger: 0,
    speed: 1,
    attack_damage: 5,
    size: 10,
    wander_range: 50,
    rest_time: 10,
};

export const EntityConfigs = new ConfigLoader(fallback);
