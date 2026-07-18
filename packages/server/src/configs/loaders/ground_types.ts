import { ConfigLoader } from "./loader.js";
import type { ContextBundle } from "./effect_context.js";

export type GroundTypeConfig = ContextBundle & {
    speed_multiplier: number;
    color: string;
};

export const GroundTypeConfigs = new ConfigLoader<
    "ground_type",
    GroundTypeConfig
>("ground_type", {
    speed_multiplier: 1,
    color: "#2a462b",
});
