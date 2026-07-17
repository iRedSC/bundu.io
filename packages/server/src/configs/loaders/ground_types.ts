import { ConfigLoader } from "./loader.js";

export type GroundTypeConfig = {
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
