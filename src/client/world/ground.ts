import * as PIXI from "pixi.js";

const types = new Map();

types.set(0, 0x2a462b);
types.set(1, 0x72084f);

export function createGround(
    type: number,
    x: number,
    y: number,
    w: number,
    h: number
) {
    const ground = new PIXI.Graphics();
    ground.zIndex = -10;
    ground.beginFill(types.get(type) || 0xffffff);
    ground.drawRect(x, y, w, h);
    return ground;
}
