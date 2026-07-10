import type { BasicPoint } from "./types";

export function packRangetoPolygon(range: Range): {
    startX: number;
    startY: number;
    points: [x: number, y: number][];
} {
    const [pos1, pos2] = range.normalized;

    // Represent the range as a rectangle polygon (clockwise or counterclockwise)
    const points: [number, number][] = [
        [pos1.x, pos1.y], // bottom-left
        [pos2.x, pos1.y], // bottom-right
        [pos2.x, pos2.y], // top-right
        [pos1.x, pos2.y], // top-left
    ];

    return {
        startX: pos1.x,
        startY: pos1.y,
        points,
    };
}

export class Range {
    pos1: BasicPoint;
    pos2: BasicPoint;

    // overload signatures
    constructor(pos1: BasicPoint, pos2: BasicPoint);
    constructor(origin: BasicPoint, width: number, height: number);

    // implementation
    constructor(a: BasicPoint, b: BasicPoint | number, c?: number) {
        if (typeof b === "object") {
            // case: Range(pos1, pos2)
            this.pos1 = a;
            this.pos2 = b;
        } else {
            // case: Range(origin, width, height)
            const origin = a;
            const width = b;
            const height = c ?? 0;
            this.pos1 = origin;
            this.pos2 = { x: origin.x + width, y: origin.y + height };
        }
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
        const [pos1, pos2] = this.normalized;
        const isInsideX = pos.x >= pos1.x && pos.x <= pos2.x;
        const isInsideY = pos.y >= pos1.y && pos.y <= pos2.y;
        return isInsideX && isInsideY;
    }

    intersects(range: Range): boolean {
        const [pos1, pos2] = this.normalized;
        const [r1, r2] = range.normalized;
        const noOverlapX = pos2.x < r1.x || pos1.x > r2.x;
        const noOverlapY = pos2.y < r1.y || pos1.y > r2.y;
        return !(noOverlapX || noOverlapY);
    }
}

export default Range;
