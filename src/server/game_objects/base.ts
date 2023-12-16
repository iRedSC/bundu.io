import { Vector, Circle } from "sat";

export class WorldObject {
    id: number;

    position: [number, number];
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

        this.position = position;
        this.rotation = rotation;
        this.collider = new Circle(new Vector(position[0], position[1]), size);
    }

    setPos(position: [number, number]) {
        this.position = position;
        this.collider.pos.x = position[0];
        this.collider.pos.y = position[1];
    }
}
