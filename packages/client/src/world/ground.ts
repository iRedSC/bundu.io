import { Graphics } from "pixi.js";
import { clientGroundType } from "../configs/registries";

/** Floor for ground zIndex — stays below entities (0+) and admin grid (-1). */
export const GROUND_Z_BASE = -10_000;

export function createGround(
    type: number,
    x: number,
    y: number,
    w: number,
    h: number,
    zIndex = GROUND_Z_BASE
) {
    const ground = new Graphics();
    ground.zIndex = zIndex;
    ground.rect(x, y, w, h).fill(clientGroundType(type).color);
    return ground;
}
