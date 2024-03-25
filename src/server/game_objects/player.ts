import { distance, lerp, moveToward } from "../../lib/transforms.js";
import { GameWS } from "../websockets.js";
import { WorldObject } from "./base.js";
import { round } from "../../lib/math.js";

export class Player extends WorldObject {
    name: string;
    socket: GameWS;
    backpack: number;
    holding?: number;
    helmet?: number;
    moveDir: [number, number];
    travelTime: number;
    lastPos: { x: number; y: number };
    arriveTime: number;
    lastMoveTime: number;
    target: { x: number; y: number };

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
        this.lastMoveTime = 0;
        this.arriveTime = 0;
        this.lastPos = { x: 0, y: 0 };
        this.target = { x: 0, y: 0 };
    }

    move() {
        if (this.moveDir[0] === 0 && this.moveDir[1] === 0) {
            return false;
        }
        const newX = this.position.x - this.moveDir[0];
        const newY = this.position.y - this.moveDir[1];
        this.target = moveToward(this.position, { x: newX, y: newY }, 100);
        this.setPosition(this.target.x, this.target.y);
        return true;
    }

    pack(type: string) {
        switch (type) {
            case "moveObject":
                return [
                    this.id,
                    50,
                    round(this.x, 1),
                    round(this.y, 1),
                    round(this.rotation, 3),
                ];
            case "rotateObject":
                return [this.id, this.rotation];
        }
        return [
            this.id,
            round(this.x, 1),
            round(this.y, 1),
            round(this.rotation, 3),
            this.name,
            this.holding || 0,
            this.helmet || 0,
            0,
            this.backpack,
        ];
    }
}
