import * as PIXI from "pixi.js";

export class Line extends PIXI.Graphics {
    start: [number, number];
    end: [number, number];
    color: number;
    size: number;
    constructor(
        start: [number, number],
        end: [number, number],
        color: number,
        size: number = 2
    ) {
        super();

        var s = (this.size = size);
        var c = (this.color = color || 0x000000);

        this.start = start;
        this.end = end;

        this.lineStyle(s, c);

        this.moveTo(start[0], start[1]);
        this.lineTo(end[0], end[1]);
    }
}
