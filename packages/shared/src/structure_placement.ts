import {
    TILE_SIZE,
    rotateOffset,
    type TilePos,
    type TileRot,
} from "./tiles";

export const DEFAULT_PLACEMENT_REACH = TILE_SIZE * 2;

export function footprintCenter(
    blocked: readonly TilePos[],
    rot: TileRot
): TilePos {
    if (blocked.length === 0) return { x: 0, y: 0 };

    let x = 0;
    let y = 0;
    for (const cell of blocked) {
        const rotated = rotateOffset(cell.x, cell.y, rot);
        x += rotated.x;
        y += rotated.y;
    }
    return { x: x / blocked.length, y: y / blocked.length };
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
