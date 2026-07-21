import type { OccupancyLayer } from "@bundu/shared/occupancy_layer";
import type { RegistryId } from "@bundu/shared/registry";
import { TILE_SIZE, type TilePos } from "@bundu/shared/tiles";
import { ConfigLoader } from "./loader.js";
import type { ContextBundle } from "./effect_context.js";
import type { PlacementAllowDeny } from "./placement_allow.js";

export type BuildingClass =
    | "building"
    | "door"
    | "spike"
    | "wall"
    | "floor"
    | "roof";

export type BuildingConfig = PlacementAllowDeny &
    ContextBundle & {
        class: BuildingClass;
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
        /**
         * When true, footprint tiles block movers/pathing.
         * Defaults by class: walls/doors/buildings solid; floors/roofs not.
         */
        solid: boolean;
        placement: {
            blocked: readonly TilePos[];
            ground: readonly RegistryId<"ground_type">[];
        };
    };

export const BuildingConfigs = new ConfigLoader<"structure", BuildingConfig>(
    "structure",
    {
        class: "building",
        health: 50,
        pointsPerSecond: 0,
        solid: true,
        placement: {
            blocked: [{ x: 0, y: 0 }],
            ground: [],
        },
    }
);

/** Maximum origin-to-edge distance of any authored gameplay footprint. */
export function structureFootprintPadding(): number {
    let padding = TILE_SIZE / 2;
    for (const config of BuildingConfigs.entries.values()) {
        for (const tile of config.placement.blocked) {
            padding = Math.max(
                padding,
                (Math.max(Math.abs(tile.x), Math.abs(tile.y)) + 0.5) *
                    TILE_SIZE
            );
        }
    }
    return padding;
}

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
    if (material === undefined) return "";
    return material.startsWith("quick_") ? "quick" : "standard";
}

export function defaultSolidForClass(buildingClass: BuildingClass): boolean {
    return buildingClass !== "floor" && buildingClass !== "roof";
}

export function occupancyLayerForClass(
    buildingClass: BuildingClass
): OccupancyLayer {
    if (buildingClass === "floor") return "floor";
    if (buildingClass === "roof") return "roof";
    return "structure";
}
