import { Graphics } from "pixi.js";
import { clientGroundType } from "../configs/registries";

/**
 * Floor for ground zIndex — stays below entities (0+) and admin grid (-1).
 * Stack order is entity id ascending (`GROUND_Z_BASE + id`); base is deep enough
 * that normal id growth never reaches the entity layer.
 */
export const GROUND_Z_BASE = -1_000_000_000;

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
