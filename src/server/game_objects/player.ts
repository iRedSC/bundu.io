import { GameWS } from "../websockets.js";
import { WorldObject } from "./base.js";

export class Player extends WorldObject {
    name: string;
    socket: GameWS;
    hasBackpack: boolean;
    holding?: number;
    helmet?: number;

    constructor(
        id: number,
        socket: GameWS,
        position: [number, number],
        rotation: number,
        name: string
    ) {
        super(id, position, rotation, 5);
        this.socket = socket;
        this.name = name;
        this.hasBackpack = false;
    }

    move(x: number, y: number) {
        const newX = this.position.x + x;
        const newY = this.position.y + y;
        this.setPosition(newX, newY);
    }
}
