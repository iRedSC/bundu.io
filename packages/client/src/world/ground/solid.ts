import { Container, Sprite, Texture, type Rectangle } from "pixi.js";
import { TILE_SIZE } from "@bundu/shared/tiles";
import {
    LAND_SEAM_FILL_INSET_TILES,
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

    const insetPx = LAND_SEAM_FILL_INSET_TILES * TILE_SIZE;
    const insetW = bounds.width - insetPx * 2;
    const insetH = bounds.height - insetPx * 2;
    if (insetW > 0 && insetH > 0) {
        // Opaque core inset past max seam cut — edge band owns the perimeter.
        const fill = new Sprite(Texture.WHITE);
        fill.tint = color;
        fill.position.set(bounds.x + insetPx, bounds.y + insetPx);
        fill.width = insetW;
        fill.height = insetH;
        root.addChild(fill);
    }
    // Tiny patches: no flat rect; seam bake owns the whole silhouette.

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
