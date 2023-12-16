import { Vector, Circle } from "sat";

export class WorldObject {
    id: number;
    rotation: number;
    size: number;
    collider: Circle;

    constructor(
        id: number,
        position: [number, number],
        rotation: number,
        size: number
    ) {
        this.id = id;
        this.rotation = rotation;
        this.collider = new Circle(new Vector(position[0], position[1]), size);
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
}
