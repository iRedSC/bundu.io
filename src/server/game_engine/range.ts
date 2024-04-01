import { BasicPoint } from "./types";

export class Range {
    pos1: BasicPoint;
    pos2: BasicPoint;
    constructor(pos1: BasicPoint, pos2: BasicPoint) {
        this.pos1 = pos1;
        this.pos2 = pos2;
    }

    get dimensions(): [number, number] {
        const width = Math.abs(this.pos1.x - this.pos2.x);
        const height = Math.abs(this.pos1.y - this.pos2.y);

        return [width, height];
    }

    get normalized(): [BasicPoint, BasicPoint] {
        return [
            {
                x: Math.min(this.pos1.x, this.pos2.x),
                y: Math.min(this.pos1.y, this.pos2.y),
            },
            {
                x: Math.max(this.pos1.x, this.pos2.x),
                y: Math.max(this.pos1.y, this.pos2.y),
            },
        ];
    }

    contains(pos: BasicPoint): boolean {
        const normalized = this.normalized;
        const pos1 = normalized[0];
        const pos2 = normalized[1];
        const isInsideX = pos.x >= pos1.x && pos.x <= pos2.x;
        const isInsideY = pos.y >= pos1.y && pos.y <= pos2.y;

        return isInsideX && isInsideY;
    }

    intersects(range: Range): boolean {
        const normalized = this.normalized;
        const pos1 = normalized[0];
        const pos2 = normalized[1];
        const noOverlapX = pos2.x < range.pos1.x || pos1.x > range.pos2.x;
        const noOverlapY = pos2.y < range.pos1.y || pos1.y > range.pos2.y;

        return !(noOverlapX || noOverlapY);
    }

    static fromPoint(point: BasicPoint, size: number) {
        const sizeX = size * 1.7;

        const p1 = { x: point.x - sizeX, y: point.y - size };
        const p2 = { x: point.x + sizeX, y: point.y + size };
        return new Range(p1, p2);
    }
}
