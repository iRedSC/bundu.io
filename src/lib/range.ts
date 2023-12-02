type Point = [number, number];

export class Range {
    pos1: Point;
    pos2: Point;
    constructor(pos1: Point, pos2: Point) {
        this.pos1 = pos1;
        this.pos2 = pos2;
    }

    get dimensions(): [number, number] {
        const width = Math.abs(this.pos1[0] - this.pos2[0]);
        const height = Math.abs(this.pos1[1] - this.pos2[1]);

        return [width, height];
    }

    get normalized(): [Point, Point] {
        return [
            [
                Math.min(this.pos1[0], this.pos2[0]),
                Math.min(this.pos1[1], this.pos2[1]),
            ],
            [
                Math.max(this.pos1[0], this.pos2[0]),
                Math.max(this.pos1[1], this.pos2[1]),
            ],
        ];
    }

    contains(pos: Point): boolean {
        const normalized = this.normalized;
        const pos1 = normalized[0];
        const pos2 = normalized[1];
        const isInsideX = pos[0] >= pos1[0] && pos[0] <= pos2[0];
        const isInsideY = pos[1] >= pos1[1] && pos[1] <= pos2[1];

        return isInsideX && isInsideY;
    }

    intersects(range: Range): boolean {
        const normalized = this.normalized;
        const pos1 = normalized[0];
        const pos2 = normalized[1];
        const noOverlapX = pos2[0] < range.pos1[0] || pos1[0] > range.pos2[0];
        const noOverlapY = pos2[1] < range.pos1[1] || pos1[1] > range.pos2[1];

        return !(noOverlapX || noOverlapY);
    }
}
