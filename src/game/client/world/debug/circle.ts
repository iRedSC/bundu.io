import * as PIXI from "pixi.js";
import { type BasicPoint } from "@ioengine/lib";

export class Circle extends PIXI.Graphics {
    r: number;
    color: number;
    size: number;
    constructor(pos: BasicPoint, r: number, color: number, size: number = 25) {
        super();

        var s = (this.size = size);
        var c = (this.color = color || 0x000000);

        this.r = r;
        this.position = pos;

        this.circle(0, 0, r);
        this.stroke({ width: s, color: c });
    }
}
