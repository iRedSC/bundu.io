import type { RegistryId } from "@bundu/shared/registry";
import type { TilePos } from "@bundu/shared/tiles";
import { ConfigLoader } from "./loader.js";

export type BuildingConfig = {
    class: "building" | "door" | "spike" | "wall";
    health: number;
    pointsPerSecond: number;
    /** Shared key for spike↔wall/door matching. */
    material?: string;
    /** Placeover rank within an upgrade group (higher replaces lower). */
    tier?: number;
    /** Contact damage when spiked (from spike config). */
    damage?: number;
    /** Reflect damage when the spiked structure is hit. */
    on_hit_damage?: number;
    /** Extra world-unit radius added to the structure collider for contact attacks. */
    attack_range?: number;
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

/** Spike building config for a wall/door material, if one exists. */
export function spikeConfigForMaterial(
    material: string
): BuildingConfig | undefined {
    for (const config of BuildingConfigs.entries.values()) {
        if (config.class === "spike" && config.material === material) {
            return config;
        }
    }
    return undefined;
}

/** Quick vs standard upgrade chains must not mix. */
export function structureUpgradeGroup(material: string | undefined): string {
    if (!material) return "";
    return material.startsWith("quick_") ? "quick" : "standard";
}
