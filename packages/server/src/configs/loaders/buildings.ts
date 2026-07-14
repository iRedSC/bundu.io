import { ConfigLoader } from "./loader.js";

export type BuildingConfig = {
    class: "building" | "door" | "spike" | "wall";
    health: number;
    pointsPerSecond: number;
};

export const BuildingConfigs = new ConfigLoader<BuildingConfig>({
    class: "building",
    health: 50,
    pointsPerSecond: 0,
});
