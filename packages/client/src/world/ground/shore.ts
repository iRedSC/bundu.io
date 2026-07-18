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

    for (const patch of patches) {
        if (isOceanType(patch.type)) continue;

        // Top edge → outward north
        for (let tx = patch.x; tx < patch.x + patch.w; tx++) {
            maybePush(shores, patches, isOceanType, tx, patch.y - 1, tx, patch.y, 0, -1);
        }
        // Bottom edge → outward south
        for (let tx = patch.x; tx < patch.x + patch.w; tx++) {
            maybePush(
                shores,
                patches,
                isOceanType,
                tx,
                patch.y + patch.h,
                tx,
                patch.y + patch.h - 1,
                0,
                1
            );
        }
        // Left edge → outward west
        for (let ty = patch.y; ty < patch.y + patch.h; ty++) {
            maybePush(shores, patches, isOceanType, patch.x - 1, ty, patch.x, ty, -1, 0);
        }
        // Right edge → outward east
        for (let ty = patch.y; ty < patch.y + patch.h; ty++) {
            maybePush(
                shores,
                patches,
                isOceanType,
                patch.x + patch.w,
                ty,
                patch.x + patch.w - 1,
                ty,
                1,
                0
            );
        }
    }
    return shores;
}

function maybePush(
    out: ShoreSample[],
    patches: readonly GroundPatchRef[],
    isOceanType: (type: number) => boolean,
    oceanTx: number,
    oceanTy: number,
    landTx: number,
    landTy: number,
    nx: number,
    ny: number
): void {
    const ocean = topPatchAt(patches, oceanTx, oceanTy);
    if (!ocean || !isOceanType(ocean.type)) return;
    const land = topPatchAt(patches, landTx, landTy);
    if (!land || isOceanType(land.type)) return;

    out.push({
        x: (landTx + 0.5 + nx * 0.45) * TILE_SIZE,
        y: (landTy + 0.5 + ny * 0.45) * TILE_SIZE,
        nx,
        ny,
    });
}

function topPatchAt(
    patches: readonly GroundPatchRef[],
    tx: number,
    ty: number
): GroundPatchRef | undefined {
    let best: GroundPatchRef | undefined;
    for (const patch of patches) {
        if (
            tx < patch.x ||
            ty < patch.y ||
            tx >= patch.x + patch.w ||
            ty >= patch.y + patch.h
        ) {
            continue;
        }
        if (!best || patch.id > best.id) best = patch;
    }
    return best;
}
