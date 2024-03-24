import * as PIXI from "pixi.js";
type Rectangle = [x: number, y: number, width: number, height: number];

export function coordsToRect(
    x1: number,
    y1: number,
    x2: number,
    y2: number
): Rectangle {
    const x = Math.min(x1, x2);
    const y = Math.min(y1, y2);
    const width = Math.abs(x1 - x2);
    const height = Math.abs(y1 - y2);

    return [x, y, width, height];
}

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
    console.log(rect);
    ground.drawRect(rect[0], rect[1], rect[2], rect[3]);
    return ground;
}
