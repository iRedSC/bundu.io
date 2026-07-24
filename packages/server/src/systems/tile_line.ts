import { hasClearTileLine, pointToTile, type TilePos } from "@bundu/shared";
import { Physics, TileEntity } from "../components/base.js";
import { isSolidTileEntity } from "../configs/loaders/placement_rules.js";
import type { World } from "../engine";

/**
 * Placement / interaction line of sight: dynamics block the segment; solid
 * structures not owned by `actorId` block intermediate tiles.
 */
export function hasOwnedClearTileLine(
    world: World,
    from: { x: number; y: number },
    to: TilePos,
    actorId: number
): boolean {
    const dynamics = world.query([Physics]).flatMap((object) => {
        if (TileEntity.get(object)) return [];
        const { collider } = object.get(Physics);
        return [
            {
                id: object.id,
                x: collider.pos.x,
                y: collider.pos.y,
                r: collider.r,
            },
        ];
    });

    return hasClearTileLine(from, to, {
        actorId,
        dynamics,
        isIntermediateBlocked: (tile) => {
            for (const occupantId of world.context.occupancy.occupants(
                tile.x,
                tile.y
            )) {
                const occupant = world.getObject(occupantId);
                if (!occupant || !isSolidTileEntity(occupant)) continue;
                const entity = TileEntity.get(occupant);
                if (entity && entity.ownerId !== actorId) return true;
            }
            return false;
        },
    });
}

/** Convenience: clear line to the tile under a world point. */
export function hasOwnedClearLineToPoint(
    world: World,
    from: { x: number; y: number },
    to: { x: number; y: number },
    actorId: number
): boolean {
    return hasOwnedClearTileLine(world, from, pointToTile(to), actorId);
}
