import { Sprite, Texture, type Rectangle } from "pixi.js";
import type { GroundVisual } from "./types";
import { bindLandSeamSprite, clearLandSeamSprite } from "./land_seam";

export function createSolidGround(
    color: number,
    bounds: Rectangle,
    zIndex: number
): GroundVisual {
    const sprite = new Sprite(Texture.WHITE);
    sprite.tint = color;
    sprite.position.set(bounds.x, bounds.y);
    sprite.width = bounds.width;
    sprite.height = bounds.height;
    sprite.zIndex = zIndex;

    return {
        container: sprite,
        applyLandSeam(map) {
            bindLandSeamSprite(sprite, bounds, map);
        },
        clearLandSeam() {
            clearLandSeamSprite(sprite, bounds, color);
        },
    };
}
