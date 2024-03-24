import { distance, lerp, moveToward } from "../../lib/transforms.js";
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
        const totalTime = this.arriveTime - this.lastMoveTime;
        const elapsedTime = Date.now() - this.lastMoveTime;
        const t = elapsedTime / totalTime;
        const tClamped = Math.max(0, Math.min(1, t));
        this.setPosition(
            lerp(this.lastPos.x, this.target.x, tClamped),
            lerp(this.lastPos.y, this.target.y, tClamped)
        );
        if (t >= 1) {
            this.newMove();
            return true;
        }
        return false;
    }

    newMove() {
        if (this.moveDir[0] === 0 && this.moveDir[1] === 0) {
            return;
        }
        this.lastPos = { ...this.position };
        this.lastMoveTime = Date.now();
        const newX = this.position.x - this.moveDir[0];
        const newY = this.position.y - this.moveDir[1];
        this.target = moveToward(this.position, { x: newX, y: newY }, 175);
        this.travelTime = distance(this.position, this.target);
        this.arriveTime = Date.now() + this.travelTime;
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
