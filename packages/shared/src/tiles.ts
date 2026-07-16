import type { BasicPoint } from "./types";

/** World units per tile edge. Art is authored at this pixel size per tile. */
export const TILE_SIZE = 100;

/** Authoritative position quantum: 100 units per tile (1 world unit). */
export const DECI_PER_TILE = 100;

/** World units per decitile. */
export const WORLD_PER_DECI = TILE_SIZE / DECI_PER_TILE;

/** Playable world extent in tiles (square). */
export const WORLD_TILES = 200;

/** Playable world extent in world units. */
export const WORLD_BOUNDS = WORLD_TILES * TILE_SIZE;

/** Player visual radius — touches tile edges when centered. */
export const PLAYER_VISUAL_RADIUS = TILE_SIZE / 2;

/** Circle collider on each occupied footprint tile. */
export const FOOTPRINT_CIRCLE_RADIUS = TILE_SIZE / 2;

/** Integer tile coordinates. */
export type TilePos = { x: number; y: number };

/** Discrete tile-entity facing: 0/90/180/270°. */
export type TileRot = 0 | 1 | 2 | 3;

export function worldToDeci(world: number): number {
    return Math.round(world / WORLD_PER_DECI);
}

export function deciToWorld(deci: number): number {
    return deci * WORLD_PER_DECI;
}

/** Snap a world coordinate to the decitile grid. */
export function quantizeWorld(world: number): number {
    return deciToWorld(worldToDeci(world));
}

export function worldToTile(world: number): number {
    return Math.floor(world / TILE_SIZE);
}

export function tileCenterWorld(tile: number): number {
    return tile * TILE_SIZE + TILE_SIZE / 2;
}

export function tileKey(x: number, y: number): number {
    return x * 1_000_000 + y;
}

/** Rotate a local footprint offset by `rot` quarter-turns (CCW). */
export function rotateOffset(x: number, y: number, rot: TileRot): TilePos {
    switch (rot) {
        case 0:
            return { x, y };
        case 1:
            return { x: -y, y: x };
        case 2:
            return { x: -x, y: -y };
        case 3:
            return { x: y, y: -x };
    }
}

/** World tiles occupied by a footprint at origin + rot. */
export function worldFootprint(
    origin: TilePos,
    blocked: readonly TilePos[],
    rot: TileRot
): TilePos[] {
    return blocked.map((cell) => {
        const local = rotateOffset(cell.x, cell.y, rot);
        return { x: origin.x + local.x, y: origin.y + local.y };
    });
}

export function tileRotToDegrees(rot: TileRot): number {
    return rot * 90;
}

export function pointToTile(pos: BasicPoint): TilePos {
    return { x: worldToTile(pos.x), y: worldToTile(pos.y) };
}

/** Single-tile footprint at local origin — default for props/resources. */
export const SINGLE_TILE: readonly TilePos[] = [{ x: 0, y: 0 }];

/** Inclusive Bresenham tiles from `a` to `b` (including both ends). */
export function tilesOnLine(a: TilePos, b: TilePos): TilePos[] {
    const tiles: TilePos[] = [];
    let x = a.x;
    let y = a.y;
    const dx = Math.abs(b.x - a.x);
    const dy = Math.abs(b.y - a.y);
    const sx = a.x < b.x ? 1 : -1;
    const sy = a.y < b.y ? 1 : -1;
    let err = dx - dy;

    for (;;) {
        tiles.push({ x, y });
        if (x === b.x && y === b.y) break;
        const e2 = 2 * err;
        if (e2 > -dy) {
            err -= dy;
            x += sx;
        }
        if (e2 < dx) {
            err += dx;
            y += sy;
        }
    }
    return tiles;
}
