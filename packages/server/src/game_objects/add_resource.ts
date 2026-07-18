import type { RegistryId } from "@bundu/shared/registry";
import type { TileRot } from "@bundu/shared/tiles";
import { stackAllowedForResource } from "../configs/loaders/placement_rules.js";
import type { GameObject, World } from "../engine";
import { Resource } from "./resource.js";
import { makeTileEntity, tileEntityPhysics } from "./tile_entity.js";

/** Place a resource if occupancy allows; returns the created object or null. */
export function tryAddResource(
    world: World,
    id: RegistryId<"resource">,
    tx: number,
    ty: number,
    rot: TileRot = 0,
    variant = "base"
): GameObject | null {
    const origin = { x: tx, y: ty };
    const tile = makeTileEntity(origin, rot);
    if (
        !world.context.occupancy.canPlace(tile.occupied, "structure") ||
        !stackAllowedForResource(world, tile.occupied, id)
    ) {
        return null;
    }

    const object = new Resource(
        tileEntityPhysics(origin, rot),
        { id, variant },
        tile
    );
    world.addObject(object);
    return object;
}
