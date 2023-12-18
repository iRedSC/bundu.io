type Point = { x: number; y: number };
export class Event {
    position: Point;
    target: number;
    type: number;

    constructor(position: Point, target: number, type: number) {
        this.position = position;
        this.target = target;
        this.type = type;
    }
}
