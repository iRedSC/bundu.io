import { WorldObject } from "./base";

export class Resource extends WorldObject {
    type: number;

    constructor(
        id: number,
        position: [number, number],
        rotation: number,
        type: number
    ) {
        super(id, position, rotation);

        this.type = type;
    }
}
