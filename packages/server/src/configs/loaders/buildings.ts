import type { RegistryId } from "@bundu/shared/registry";
import type { TilePos } from "@bundu/shared/tiles";
import { ConfigLoader } from "./loader.js";

export type BuildingConfig = {
    class: "building" | "door" | "spike" | "wall";
    health: number;
    pointsPerSecond: number;
    placement: {
        blocked: readonly TilePos[];
        ground: readonly RegistryId<"ground_type">[];
    };
};

export const BuildingConfigs = new ConfigLoader<"structure", BuildingConfig>("structure", {
    class: "building",
    health: 50,
    pointsPerSecond: 0,
    placement: {
        blocked: [{ x: 0, y: 0 }],
        ground: [],
    },
});
