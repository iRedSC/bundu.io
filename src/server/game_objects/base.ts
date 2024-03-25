import sat from "sat";
const { Vector, Circle } = sat;

export class WorldObject {
    id: number;
    rotation: number;
    size: number;
    collider: sat.Circle;

    constructor(
        id: number,
        position: [number, number],
        rotation: number,
        size: number
    ) {
        this.size = size;
        this.id = id;
        this.rotation = rotation;
        this.collider = new Circle(
            new Vector(position[0], position[1]),
            size * 10
        );
    }

    get x() {
        return this.collider.pos.x;
    }
    get y() {
        return this.collider.pos.y;
    }
    get position() {
        return this.collider.pos;
    }

    setPosition(x: number, y: number) {
        this.collider.pos.x = x;
        this.collider.pos.y = y;
    }

    pack(type: string): any[] {
        return [];
    }
}
