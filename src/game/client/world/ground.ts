import {Graphics} from "pixi.js";

const types = new Map();

types.set(1, 0x2a462b);
types.set(2, 0xcedfe3);
types.set(3, 0xb5a478);
types.set(4, 0xc3b47a);

export function createGround(
    type: number,
    x: number,
    y: number,
    w: number,
    h: number
) {
    const ground = new Graphics();
    ground.zIndex = -10;
    ground
        .rect(x, y, w, h)
        .fill(types.get(type) || 0xffffff);
    return ground;
}
