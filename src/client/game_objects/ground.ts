import * as PIXI from "pixi.js";
import { Viewport } from "pixi-viewport";

type Coordinates = [[x: number, y: number], [x: number, y: number]];
type Rectangle = [x: number, y: number, width: number, height: number];

export function coordsToRect(coords: Coordinates): Rectangle {
    const set1 = coords[0];
    const set2 = coords[1];
    const x = Math.min(set1[0], set2[0]);
    const y = Math.min(set1[1], set2[1]);
    const width = Math.abs(set1[0] - set2[0]);
    const height = Math.abs(set1[1] - set2[1]);

    return [x, y, width, height];
}
export class Ground {
    graphics: PIXI.Graphics;

    constructor(world: Viewport, coords: Coordinates, color: number) {
        this.graphics = new PIXI.Graphics();
        this.graphics.beginFill(color);
        this.graphics.lineStyle({ width: 0 });
        const rect = coordsToRect(coords);
        this.graphics.drawRect(rect[0], rect[1], rect[2], rect[3]);
        world.addChild(this.graphics);
    }
}
