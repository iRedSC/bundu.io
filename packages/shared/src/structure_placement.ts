import {
    TILE_SIZE,
    rotateOffset,
    type TilePos,
    type TileRot,
} from "./tiles";

export const DEFAULT_PLACEMENT_REACH = TILE_SIZE * 2;
/** Default player reach for right-click world interactions (doors, …). */
export const DEFAULT_INTERACTION_REACH = TILE_SIZE * 2;

export function footprintCenter(
    blocked: readonly TilePos[],
    rot: TileRot
): TilePos {
    if (blocked.length === 0) return { x: 0, y: 0 };

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const cell of blocked) {
        const rotated = rotateOffset(cell.x, cell.y, rot);
        minX = Math.min(minX, rotated.x);
        minY = Math.min(minY, rotated.y);
        maxX = Math.max(maxX, rotated.x);
        maxY = Math.max(maxY, rotated.y);
    }
    return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

/** Place the footprint center on the cursor tile. */
export function structureOriginAtPoint(
    cursor: TilePos,
    blocked: readonly TilePos[],
    rot: TileRot
): TilePos {
    const center = footprintCenter(blocked, rot);
    return {
        x: Math.round(cursor.x - center.x),
        y: Math.round(cursor.y - center.y),
    };
}
