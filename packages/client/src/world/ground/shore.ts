import { TILE_SIZE } from "@bundu/shared/tiles";
import type { ShoreSample } from "./types";

export type GroundPatchRef = {
    id: number;
    type: number;
    /** Tile-space rect. */
    x: number;
    y: number;
    w: number;
    h: number;
};

/** Sample every N edge tiles to keep shore lists small on large coasts. */
const EDGE_STRIDE = 2;
/** Hard cap — foam only needs a sparse random set. */
const MAX_SHORES = 240;

/**
 * Shore samples where land (non-ocean) meets ocean along rect edges.
 * Uses the same topmost-id stack rule as `topGroundAt`.
 */
export function collectShoreSamples(
    patches: readonly GroundPatchRef[],
    isOceanType: (type: number) => boolean
): ShoreSample[] {
    const shores: ShoreSample[] = [];
    if (patches.length === 0) return shores;

    // Highest id first so topPatchAt can return on first hit.
    const byTop = [...patches].sort((a, b) => b.id - a.id);

    for (const patch of patches) {
        if (isOceanType(patch.type)) continue;
        if (shores.length >= MAX_SHORES) break;

        walkEdge(shores, byTop, isOceanType, patch, "n");
        if (shores.length >= MAX_SHORES) break;
        walkEdge(shores, byTop, isOceanType, patch, "s");
        if (shores.length >= MAX_SHORES) break;
        walkEdge(shores, byTop, isOceanType, patch, "w");
        if (shores.length >= MAX_SHORES) break;
        walkEdge(shores, byTop, isOceanType, patch, "e");
    }
    return shores;
}

function walkEdge(
    out: ShoreSample[],
    byTop: readonly GroundPatchRef[],
    isOceanType: (type: number) => boolean,
    patch: GroundPatchRef,
    side: "n" | "s" | "w" | "e"
): void {
    if (side === "n" || side === "s") {
        const tyLand = side === "n" ? patch.y : patch.y + patch.h - 1;
        const tyOcean = side === "n" ? patch.y - 1 : patch.y + patch.h;
        const ny = side === "n" ? -1 : 1;
        for (let tx = patch.x; tx < patch.x + patch.w; tx += EDGE_STRIDE) {
            if (out.length >= MAX_SHORES) return;
            maybePush(out, byTop, isOceanType, tx, tyOcean, tx, tyLand, 0, ny);
        }
        return;
    }

    const txLand = side === "w" ? patch.x : patch.x + patch.w - 1;
    const txOcean = side === "w" ? patch.x - 1 : patch.x + patch.w;
    const nx = side === "w" ? -1 : 1;
    for (let ty = patch.y; ty < patch.y + patch.h; ty += EDGE_STRIDE) {
        if (out.length >= MAX_SHORES) return;
        maybePush(out, byTop, isOceanType, txOcean, ty, txLand, ty, nx, 0);
    }
}

function maybePush(
    out: ShoreSample[],
    byTop: readonly GroundPatchRef[],
    isOceanType: (type: number) => boolean,
    oceanTx: number,
    oceanTy: number,
    landTx: number,
    landTy: number,
    nx: number,
    ny: number
): void {
    const ocean = topPatchAt(byTop, oceanTx, oceanTy);
    if (!ocean || !isOceanType(ocean.type)) return;
    const land = topPatchAt(byTop, landTx, landTy);
    if (!land || isOceanType(land.type)) return;

    out.push({
        x: (landTx + 0.5 + nx * 0.45) * TILE_SIZE,
        y: (landTy + 0.5 + ny * 0.45) * TILE_SIZE,
        nx,
        ny,
    });
}

/** `byTop` must be sorted by id descending. */
function topPatchAt(
    byTop: readonly GroundPatchRef[],
    tx: number,
    ty: number
): GroundPatchRef | undefined {
    for (const patch of byTop) {
        if (
            tx >= patch.x &&
            ty >= patch.y &&
            tx < patch.x + patch.w &&
            ty < patch.y + patch.h
        ) {
            return patch;
        }
    }
    return undefined;
}
