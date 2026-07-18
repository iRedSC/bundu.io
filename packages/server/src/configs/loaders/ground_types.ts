import { ConfigLoader } from "./loader.js";
import type { ContextBundle } from "./effect_context.js";

export type GroundTypeConfig = ContextBundle & {
    speed_multiplier: number;
    /** Client ground-model id (not an entity model). */
    model: string;
};

export const GroundTypeConfigs = new ConfigLoader<
    "ground_type",
    GroundTypeConfig
>("ground_type", {
    speed_multiplier: 1,
    model: "grass",
});
