import type { RegistryId } from "@bundu/shared/registry";
import { ConfigLoader } from "./loader.js";

export type ResourceConfig = {
    destroy_on_empty: boolean;
    score: number | null;
    level: number;
    exclusive: boolean;
    multipliers: Record<string, number>;
    decay: number | null;
    regen_speed: number;
    quantity: number;
    lootTable: RegistryId<"loot_table"> | null;
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
};

export const ResourceConfigs = new ConfigLoader<"resource", ResourceConfig>("resource", fallback);
