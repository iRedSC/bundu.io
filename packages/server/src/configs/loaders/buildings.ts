import { ConfigLoader } from "./loader.js";

export type BuildingConfig = {
    health: number;
};

export const BuildingConfigs = new ConfigLoader<BuildingConfig>({ health: 50 });
