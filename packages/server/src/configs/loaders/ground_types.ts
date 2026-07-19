import { ConfigLoader } from "./loader.js";
import type { ContextBundle } from "./effect_context.js";

export type GroundTypeConfig = ContextBundle & {
    /** Client ground-model id (not an entity model). */
    model: string;
    /** When true, players at max heat take overheat damage on this ground. */
    overheat: boolean;
};

export const GroundTypeConfigs = new ConfigLoader<
    "ground_type",
    GroundTypeConfig
>("ground_type", {
    model: "grass",
    overheat: false,
});
