import * as PIXI from "pixi.js";
import { coordsToRect } from "../../lib/transforms";

const types = new Map();

types.set(0, 0x105903);
types.set(1, 0x72084f);

export function createGround(
    type: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number
) {
    const ground = new PIXI.Graphics();
    ground.beginFill(types.get(type) || 0xffffff);
    const rect = coordsToRect(x1, y1, x2, y2);
    ground.drawRect(rect.x, rect.y, rect.width, rect.height);
    return ground;
}
