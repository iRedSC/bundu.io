import { ConfigLoader } from "./loader.js";

export type BuildingConfig = {
    health: number;
    pointsPerSecond: number;
};

export const BuildingConfigs = new ConfigLoader<BuildingConfig>({
    health: 50,
    pointsPerSecond: 0,
});
