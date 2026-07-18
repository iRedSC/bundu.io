import type { RegistryId } from "@bundu/shared/registry";
import { ConfigLoader } from "./loader.js";
import type { PlacementAllowDeny } from "./placement_allow.js";

export type ResourceConfig = PlacementAllowDeny & {
    destroy_on_empty: boolean;
    score: number | null;
    level: number;
    exclusive: boolean;
    multipliers: Record<string, number>;
    decay: number | null;
    regen_speed: number;
    quantity: number;
    lootTable: RegistryId<"loot_table"> | null;
    /** Resources occupy the structure layer; default solid. */
    solid: boolean;
};

const fallback: ResourceConfig = {
    destroy_on_empty: false,
    score: 0,
    level: 0,
    exclusive: false,
    multipliers: {},
    decay: null,
    regen_speed: 0,
    quantity: 0,
    lootTable: null,
    solid: true,
};

export const ResourceConfigs = new ConfigLoader<"resource", ResourceConfig>(
    "resource",
    fallback
);
