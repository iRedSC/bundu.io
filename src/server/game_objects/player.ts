import { moveToward } from "../../lib/transforms";
import { WorldObject } from "./base";

export class Player extends WorldObject {
    name: string;
    send: Function;
    hasBackpack: boolean;
    holding?: number;
    helmet?: number;

    constructor(
        id: number,
        send: Function,
        position: [number, number],
        rotation: number,
        name: string
    ) {
        super(id, position, rotation, 5);
        this.send = send;
        this.name = name;
        this.hasBackpack = false;
    }

    move(x: number, y: number) {
        const newX = this.position.x + x;
        const newY = this.position.y + y;
        this.setPosition(newX, newY);
    }
}
