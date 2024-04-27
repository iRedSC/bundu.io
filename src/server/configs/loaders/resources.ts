import { z } from "zod";
import { ConfigLoader } from "./loader.js";
import { idMap } from "./id_map.js";

const ResourceConfig = z.object({
    destroy_on_empty: z.boolean(),
    score: z.number(),
    level: z.number(),
    exclusive: z.boolean(),
    multipliers: z.record(z.string(), z.number()),
    decay: z.number().nullable(),
    regen_speed: z.number(),
    items: z.record(z.number(), z.number()),
});
type ResourceConfig = z.infer<typeof ResourceConfig>;

const fallback: ResourceConfig = {
    destroy_on_empty: false,
    score: 0,
    level: 0,
    exclusive: false,
    multipliers: {},
    decay: null,
    regen_speed: 0,
    items: {},
};

export const ResourceConfigs = new ConfigLoader(
    ResourceConfig,
    fallback,
    idMap
);
