import { __dirname, idMap } from "./id_map.js";
import { z } from "zod";
import { ConfigLoader } from "./loader.js";

export const ItemConfig = z.object({
    type: z.string().nullable(),
    function: z.string().nullable(),
    level: z.number(),

    attributes: z.record(
        z.string(),
        z.object({
            op: z.union([z.literal("add"), z.literal("multiply")]),
            value: z.number(),
        })
    ),

    stats: z.record(z.string(), z.number()),
    flags: z.string().array(),

    unequip_delay: z.number(),
});
export type ItemConfig = z.infer<typeof ItemConfig>;

const fallback: ItemConfig = {
    type: null,
    function: null,
    level: 0,
    attributes: {},
    stats: {},
    flags: [],
    unequip_delay: 0,
};

export const ItemConfigs = new ConfigLoader<ItemConfig>(
    ItemConfig,
    fallback,
    idMap
);
