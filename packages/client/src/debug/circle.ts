import * as PIXI from "pixi.js";
import type { BasicPoint } from "@bundu/shared";

export class Circle extends PIXI.Graphics {
    r: number;
    color: number;
    size: number;
    constructor(pos: BasicPoint, r: number, color: number, size: number = 25) {
        super();

        this.size = size;
        this.color = color || 0x000000;
        const s = this.size;
        const c = this.color;

        this.r = r;
        this.position = pos;

        this.circle(0, 0, r);
        this.stroke({ width: s, color: c });
    }
}
