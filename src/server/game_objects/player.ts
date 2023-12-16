import { WorldObject } from "./base";

export class Player extends WorldObject {
    name: string;
    hasBackpack: boolean;
    holding?: number;
    helmet?: number;

    constructor(
        id: number,
        position: [number, number],
        rotation: number,
        name: string
    ) {
        super(id, position, rotation, 5);
        this.name = name;
        this.hasBackpack = false;
    }
}
