export class WorldObject {
    id: number;

    position: [number, number];
    rotation: number;

    constructor(id: number, position: [number, number], rotation: number) {
        this.id = id;

        this.position = position;
        this.rotation = rotation;
    }
}
