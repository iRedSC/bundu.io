import { Graphics } from "pixi.js";
import { clientGroundType } from "../configs/registries";

export function createGround(
    type: number,
    x: number,
    y: number,
    w: number,
    h: number
) {
    const ground = new Graphics();
    ground.zIndex = -10;
    ground.rect(x, y, w, h).fill(clientGroundType(type).color);
    return ground;
}
