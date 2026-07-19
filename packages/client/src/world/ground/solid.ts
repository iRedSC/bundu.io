import { Container, Sprite, Texture, type Rectangle } from "pixi.js";
import { TILE_SIZE } from "@bundu/shared/tiles";
import {
    LAND_SEAM_PAD_TILES,
    addLandSeamChunk,
    clearLandSeamLayer,
    type LandSeamChunkBake,
} from "./land_seam";
import type { GroundVisual } from "./types";

export function createSolidGround(
    color: number,
    bounds: Rectangle,
    zIndex: number
): GroundVisual {
    const root = new Container();
    root.zIndex = zIndex;

    const fill = new Sprite(Texture.WHITE);
    fill.tint = color;
    const padPx = LAND_SEAM_PAD_TILES * TILE_SIZE;
    const insetW = bounds.width - padPx * 2;
    const insetH = bounds.height - padPx * 2;
    if (insetW > 0 && insetH > 0) {
        // Safe opaque core — edge band overlays own the wiggly perimeter.
        fill.position.set(bounds.x + padPx, bounds.y + padPx);
        fill.width = insetW;
        fill.height = insetH;
    } else {
        // Tiny patch: full AABB fill; seam chunks cover the padded ring.
        fill.position.set(bounds.x, bounds.y);
        fill.width = bounds.width;
        fill.height = bounds.height;
    }
    root.addChild(fill);

    const seamLayer = new Container();
    root.addChild(seamLayer);

    return {
        container: root,
        applyLandSeam(chunk: LandSeamChunkBake) {
            addLandSeamChunk(seamLayer, chunk);
        },
        clearLandSeam() {
            clearLandSeamLayer(seamLayer);
        },
    };
}
