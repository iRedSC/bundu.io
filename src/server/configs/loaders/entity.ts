import { z } from "zod";
import { Component } from "../../game_engine/component.js";
import { ConfigLoader } from "./loader.js";
import { idMap } from "./id_map.js";

const EntityConfig = z.object({
    anger: z.number(),
    speed: z.number(),
    attack_damage: z.number(),
    size: z.number(),
    wander_range: z.number(),
    rest_time: z.number(),
});
export type EntityConfig = z.infer<typeof EntityConfig>;

const fallback = {
    anger: 0,
    speed: 1,
    attack_damage: 5,
    size: 25,
    wander_range: 50,
    rest_time: 10,
};

export const EntityConfigs = new ConfigLoader(EntityConfig, fallback, idMap);
