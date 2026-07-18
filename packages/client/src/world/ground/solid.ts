import { Graphics, type Rectangle } from "pixi.js";
import type { GroundModelDef, GroundVisual } from "./types";

export function createSolidGround(
    color: number,
    bounds: Rectangle,
    zIndex: number
): GroundVisual {
    const container = new Graphics();
    container.zIndex = zIndex;
    container.rect(bounds.x, bounds.y, bounds.width, bounds.height).fill(color);
    return { container };
}

export function solidModel(id: string, hex: string): GroundModelDef {
    const color = Number.parseInt(hex.replace("#", ""), 16);
    return {
        id,
        color: hex,
        create(bounds, zIndex) {
            return createSolidGround(color, bounds, zIndex);
        },
    };
}
