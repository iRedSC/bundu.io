import { distance } from "../../lib/transforms.js";
import { GameWS } from "../websockets.js";
import { WorldObject } from "./base.js";

export class Player extends WorldObject {
    name: string;
    socket: GameWS;
    backpack: number;
    holding?: number;
    helmet?: number;
    moveDir: [number, number];
    travelTime: number;

    constructor(
        id: number,
        socket: GameWS,
        position: [number, number],
        rotation: number,
        name: string
    ) {
        super(id, position, rotation, 5);
        this.moveDir = [0, 0];
        this.socket = socket;
        this.name = name;
        this.backpack = 0;
        this.travelTime = 0;
    }

    move() {
        const newX = this.position.x - this.moveDir[0] * 100;
        const newY = this.position.y - this.moveDir[1] * 100;
        this.travelTime = distance(this.position, { x: newX, y: newY }) / 2;
        this.setPosition(newX, newY);
    }

    pack() {
        return [this.id, this.travelTime, this.x, this.y, this.rotation];
    }

    packNew() {
        return [
            this.id,
            this.x,
            this.y,
            this.rotation,
            this.name,
            this.holding || 0,
            this.helmet || 0,
            0,
            this.backpack,
        ];
    }
}
