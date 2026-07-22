import { WORLD_TILES } from "@bundu/shared/tiles";
import { GroundData } from "../components/base.js";
import type { World } from "../engine";

const CELL_COUNT = WORLD_TILES * WORLD_TILES;
/** Sentinel: no ground covering this tile. */
const EMPTY = -1;

let cachedTypes: Int32Array | null = null;
let cachedFingerprint = "";

function fingerprint(world: World): string {
    let parts = "";
    for (const ground of world.query([GroundData])) {
        if (!ground.active) continue;
        const { collider, type } = ground.get(GroundData);
        const { pos, w, h } = collider;
        parts += `${ground.id}:${type}:${pos.x},${pos.y},${w},${h};`;
    }
    return parts;
}

/** Rebuild when ground patches change; O(grounds × area) — rare vs path queries. */
function ensureIndex(world: World): Int32Array {
    const fp = fingerprint(world);
    if (cachedTypes && fp === cachedFingerprint) return cachedTypes;

    const types = new Int32Array(CELL_COUNT);
    types.fill(EMPTY);
    const grounds = world
        .query([GroundData])
        .filter((ground) => ground.active)
        .sort((a, b) => a.id - b.id);
    for (const ground of grounds) {
        const { collider, type } = ground.get(GroundData);
        const { pos, w, h } = collider;
        const x0 = Math.max(0, Math.floor(pos.x));
        const y0 = Math.max(0, Math.floor(pos.y));
        const x1 = Math.min(WORLD_TILES, Math.floor(pos.x + w));
        const y1 = Math.min(WORLD_TILES, Math.floor(pos.y + h));
        for (let ty = y0; ty < y1; ty++) {
            const row = ty * WORLD_TILES;
            for (let tx = x0; tx < x1; tx++) {
                types[row + tx] = type;
            }
        }
    }
    cachedTypes = types;
    cachedFingerprint = fp;
    return types;
}

/** Top ground type id at a tile, or undefined if uncovered. */
export function groundTypeAt(
    world: World,
    tx: number,
    ty: number
): number | undefined {
    if (tx < 0 || ty < 0 || tx >= WORLD_TILES || ty >= WORLD_TILES) {
        return undefined;
    }
    const value = ensureIndex(world)[ty * WORLD_TILES + tx];
    if (value === undefined || value === EMPTY) return undefined;
    return value;
}

/** Drop cached grid (tests / forced rebuild). */
export function clearGroundIndex(): void {
    cachedTypes = null;
    cachedFingerprint = "";
}
