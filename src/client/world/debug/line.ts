import * as PIXI from "pixi.js";
import { BasicPoint } from "../../../lib/types";

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

        this.lineStyle(s, c);

        this.moveTo(start.x, start.y);
        this.lineTo(end.x, end.y);
    }
}
