import * as PIXI from "pixi.js";

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
export class Ground extends PIXI.Graphics {
    constructor(coords: Coordinates, color: number) {
        super();
        this.beginFill(color);
        const rect = coordsToRect(coords);
        this.drawRect(rect[0], rect[1], rect[2], rect[3]);
    }
}
