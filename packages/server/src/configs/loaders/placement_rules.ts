import type { TilePos } from "@bundu/shared/tiles";
import type { GameObject, World } from "../../engine";
import { ResourceData, TileEntity, Type } from "../../components/base.js";
import { BuildingConfigs, type BuildingConfig } from "./buildings.js";
import type { PlacementAllowDeny } from "./placement_allow.js";
import { ResourceConfigs } from "./resources.js";

export type { PlacementAllowDeny };

/**
 * `allowed` omitted → allow all; `allowed: []` → allow none.
 * `denied` always wins over allow.
 */
export function isAllowedByLists(
    id: number,
    allowed: readonly number[] | undefined,
    denied: readonly number[] | undefined
): boolean {
    if (denied?.includes(id)) return false;
    if (allowed === undefined) return true;
    return allowed.includes(id);
}

export function placementListsFor(
    object: GameObject
): PlacementAllowDeny | undefined {
    if (ResourceData.get(object)) {
        return ResourceConfigs.get(Type.get(object)?.id);
    }
    if (TileEntity.get(object) && Type.get(object)) {
        return BuildingConfigs.get(Type.get(object)?.id);
    }
    return undefined;
}

export function isSolidTileEntity(object: GameObject): boolean {
    if (ResourceData.get(object)) {
        return ResourceConfigs.get(Type.get(object)?.id).solid;
    }
    const type = Type.get(object);
    if (!type || !TileEntity.get(object)) return false;
    return BuildingConfigs.get(type.id).solid;
}

type PlaceKind = "structure" | "roof" | "floor" | "resource";

function placeKindForBuilding(config: BuildingConfig): PlaceKind {
    if (config.class === "roof") return "roof";
    if (config.class === "floor") return "floor";
    return "structure";
}

function hostAllows(
    host: PlacementAllowDeny,
    kind: PlaceKind,
    id: number
): boolean {
    switch (kind) {
        case "structure":
            return isAllowedByLists(
                id,
                host.allowedStructures,
                host.deniedStructures
            );
        case "roof":
            return isAllowedByLists(id, host.allowedRoofs, host.deniedRoofs);
        case "floor":
            return isAllowedByLists(id, host.allowedFloors, host.deniedFloors);
        case "resource":
            return isAllowedByLists(
                id,
                host.allowedResources,
                host.deniedResources
            );
    }
}

/** True when every co-occupant on the footprint allows placing `kind` id. */
export function stackAllowed(
    world: World,
    occupied: readonly TilePos[],
    kind: PlaceKind,
    id: number,
    /** Skip this entity (e.g. self during re-occupy). */
    exceptId?: number
): boolean {
    for (const { x, y } of occupied) {
        for (const occupantId of world.context.occupancy.occupants(x, y)) {
            if (occupantId === exceptId) continue;
            const object = world.getObject(occupantId);
            if (!object) continue;
            const lists = placementListsFor(object);
            if (!lists) continue;
            if (!hostAllows(lists, kind, id)) return false;
        }
    }
    return true;
}

export function stackAllowedForBuilding(
    world: World,
    occupied: readonly TilePos[],
    config: BuildingConfig,
    structureId: number,
    exceptId?: number
): boolean {
    return stackAllowed(
        world,
        occupied,
        placeKindForBuilding(config),
        structureId,
        exceptId
    );
}

export function stackAllowedForResource(
    world: World,
    occupied: readonly TilePos[],
    resourceId: number,
    exceptId?: number
): boolean {
    return stackAllowed(world, occupied, "resource", resourceId, exceptId);
}
