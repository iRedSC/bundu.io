import * as PIXI from "pixi.js";
import { BasicPoint } from "../../../lib/types";

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

        this.lineStyle(s, c);
        this.drawCircle(0, 0, r * 10);
    }
}
