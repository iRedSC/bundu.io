import { __dirname, idMap } from "./id_map.js";
import { z } from "zod";
import { ConfigLoader } from "./loader.js";

export const BuildingConfig = z.object({
    class: z.string().nullable(),

    health: z.number(),

    touch_damage: z.number(),
    hit_damage: z.number(),

    flags_nearby: z.string().array(),
    flags_touching: z.string().array(),

    nearby_distance: z.number(),
});
export type BuildingConfig = z.infer<typeof BuildingConfig>;

const fallback: BuildingConfig = {
    class: null,
    health: 50,
    touch_damage: 0,
    hit_damage: 0,
    flags_nearby: [],
    flags_touching: [],
    nearby_distance: 100,
};

export const BuildingConfigs = new ConfigLoader<BuildingConfig>(
    BuildingConfig,
    fallback,
    idMap
);
