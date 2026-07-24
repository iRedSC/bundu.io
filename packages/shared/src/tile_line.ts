import {
    pointToTile,
    tileCenterWorld,
    tilesOnLine,
    type TilePos,
} from "./tiles";
import type { BasicPoint } from "./types";

/** True when segment AB comes within `radius` of point C. */
export function segmentHitsCircle(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    cx: number,
    cy: number,
    radius: number
): boolean {
    const abx = bx - ax;
    const aby = by - ay;
    const acx = cx - ax;
    const acy = cy - ay;
    const abLenSq = abx * abx + aby * aby;
    if (abLenSq === 0) return acx * acx + acy * acy <= radius * radius;
    const t = Math.max(0, Math.min(1, (acx * abx + acy * aby) / abLenSq));
    const dx = cx - (ax + t * abx);
    const dy = cy - (ay + t * aby);
    return dx * dx + dy * dy <= radius * radius;
}

export type TileLineDynamic = {
    id: number;
    x: number;
    y: number;
    r: number;
};

/**
 * Line from a point to a target tile center: blocked by dynamic bodies on the
 * segment, or by intermediate solid tiles (caller decides which tiles block).
 * The actor's own tile is not structure-checked — dynamics still block.
 */
export function hasClearTileLine(
    from: BasicPoint,
    to: TilePos,
    options: {
        actorId: number;
        dynamics: readonly TileLineDynamic[];
        /** Intermediate tiles excluding destination; return true to block. */
        isIntermediateBlocked: (tile: TilePos) => boolean;
    }
): boolean {
    const toX = tileCenterWorld(to.x);
    const toY = tileCenterWorld(to.y);

    for (const body of options.dynamics) {
        if (body.id === options.actorId) continue;
        if (
            segmentHitsCircle(
                from.x,
                from.y,
                toX,
                toY,
                body.x,
                body.y,
                body.r
            )
        ) {
            return false;
        }
    }

    const fromTile = pointToTile(from);
    const tiles = tilesOnLine(fromTile, to);
    for (let i = 0; i < tiles.length - 1; i++) {
        const tile = tiles[i];
        if (!tile) continue;
        if (tile.x === fromTile.x && tile.y === fromTile.y) continue;
        if (options.isIntermediateBlocked(tile)) return false;
    }
    return true;
}
