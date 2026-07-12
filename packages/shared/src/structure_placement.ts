import { getStringId } from "./id_map";
import {
    SINGLE_TILE,
    TILE_SIZE,
    rotateOffset,
    tileCenterWorld,
    type TilePos,
    type TileRot,
} from "./tiles";

export type StructurePlacementDef = {
    blocked: readonly TilePos[];
    /** Ground type ids that may support every occupied cell. */
    ground: readonly number[];
};

export const DEFAULT_PLACEMENT_REACH = TILE_SIZE * 2;

const DEFAULT_STRUCTURE: StructurePlacementDef = {
    blocked: SINGLE_TILE,
    ground: [1],
};

/** Structure-specific geometry lives here; unspecified placeables are one tile. */
export const STRUCTURE_PLACEMENT_DEFS: Readonly<
    Partial<Record<string, StructurePlacementDef>>
> = {};

export function structurePlacementDef(
    structure: string | number
): StructurePlacementDef {
    const name =
        typeof structure === "number" ? getStringId(structure) : structure;
    return STRUCTURE_PLACEMENT_DEFS[name] ?? DEFAULT_STRUCTURE;
}

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
        x: Math.round((cursor.x - tileCenterWorld(0)) / TILE_SIZE - center.x),
        y: Math.round((cursor.y - tileCenterWorld(0)) / TILE_SIZE - center.y),
    };
}
