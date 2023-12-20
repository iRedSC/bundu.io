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
export class Ground extends PIXI.Graphics {
    constructor(color: number, x1: number, y1: number, x2: number, y2: number) {
        super();
        this.beginFill(color);
        const rect = coordsToRect(x1, x2, y1, y2);
        this.drawRect(rect[0], rect[1], rect[2], rect[3]);
    }
}
