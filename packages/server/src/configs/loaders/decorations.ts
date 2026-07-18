import { ConfigLoader } from "./loader.js";

export type DecorationConfig = {
    /** Base world-unit size (longest edge) at scale 1. */
    size: number;
    /** Relative paint layer (higher draws above). */
    z: number;
};

export const DecorationConfigs = new ConfigLoader<"decoration", DecorationConfig>(
    "decoration",
    {
        size: 80,
        z: 10,
    }
);
