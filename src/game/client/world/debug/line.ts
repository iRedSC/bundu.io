import * as PIXI from "pixi.js";
import { type BasicPoint } from "@ioengine/lib";

export class Line extends PIXI.Graphics {
    start: BasicPoint;
    end: BasicPoint;
    color: number;
    size: number;
    constructor(
        start: BasicPoint,
        end: BasicPoint,
        color: number,
        size: number = 2
    ) {
        super();

        var s = (this.size = size);
        var c = (this.color = color || 0x000000);

        this.start = start;
        this.end = end;

        this.moveTo(start.x, start.y);
        this.lineTo(end.x, end.y);
        this.stroke({ width: s, color: c });
    }
}
