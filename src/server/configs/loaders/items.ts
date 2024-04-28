import { __dirname, idMap } from "./id_map.js";
import { z } from "zod";
import { ConfigLoader } from "./loader.js";

export const ItemConfig = z.object({
    type: z.string().nullable(),
    function: z.string(),
    attack_damage: z.number().nullable(),

    speed_multiplier: z.number(),

    attack_origin: z.number().nullable(),
    attack_reach: z.number().nullable(),
    attack_sweep: z.number().nullable(),
    attack_speed_mult: z.number(),

    block: z.number(),
    defense: z.number(),

    level: z.number(),
    repair: z.number(),

    eat_heal: z.number(),
    eat_damage: z.number(),
    food: z.number(),

    warmth: z.number(),
    insulation: z.number(),
});
export type ItemConfig = z.infer<typeof ItemConfig>;

const fallback: ItemConfig = {
    type: null,
    function: "none",
    attack_damage: null,
    attack_origin: null,
    attack_reach: null,
    attack_sweep: null,
    attack_speed_mult: 1,
    speed_multiplier: 1,
    block: 0,
    defense: 0,
    level: 0,
    repair: 0,
    eat_damage: 0,
    eat_heal: 0,
    food: 0,
    warmth: 0,
    insulation: 0,
};

export const ItemConfigs = new ConfigLoader<ItemConfig>(
    ItemConfig,
    fallback,
    idMap
);
