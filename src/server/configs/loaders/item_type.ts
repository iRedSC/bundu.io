import { __dirname, idMap } from "./id_map.js";
import { mergeObjects } from "../../../lib/object_utils.js";
import { ConfigLoader } from "./loader.js";
import { z } from "zod";

const ItemTypeConfig = z.object({
    function: z.string(),
    speed_multiplier: z.number(),
});
export type ItemTypeConfig = z.infer<typeof ItemTypeConfig>;

const fallback: ItemTypeConfig = {
    function: "none",
    speed_multiplier: 1,
};

export const ItemTypeConfigs = new ConfigLoader<ItemTypeConfig>(
    ItemTypeConfig,
    fallback,
    idMap
);
