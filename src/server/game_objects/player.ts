import { distance, lerp, moveToward } from "../../lib/transforms.js";
import { GameWS } from "../websockets.js";
import { WorldObject } from "./base.js";
import { round } from "../../lib/math.js";
import { PACKET_TYPE } from "../../shared/enums.js";

// Player should have the following properties:
// name, socket, inventory, cosmetics, movement

export class Player extends WorldObject {
    name: string;
    socket: GameWS;
    backpack: number;
    holding?: number;
    helmet?: number;
    moveDir: [number, number];

    constructor(
        id: number,
        socket: GameWS,
        position: [number, number],
        rotation: number,
        name: string
    ) {
        super(id, position, rotation, 1);
        this.moveDir = [0, 0];
        this.socket = socket;
        this.name = name;
        this.backpack = 0;
    }

    move() {
        if (this.moveDir[0] === 0 && this.moveDir[1] === 0) {
            return false;
        }
        const newX = this.position.x - this.moveDir[0];
        const newY = this.position.y - this.moveDir[1];
        const target = moveToward(this.position, { x: newX, y: newY }, 10);
        this.setPosition(target.x, target.y);
        return true;
    }

    pack(type: PACKET_TYPE): any[] {
        switch (type) {
            case PACKET_TYPE.MOVE_OBJECT:
                return [
                    this.id,
                    50,
                    round(this.x, 1),
                    round(this.y, 1),
                    round(this.rotation, 3),
                ];
            case PACKET_TYPE.ROTATE_OBJECT:
                return [this.id, this.rotation];
            case PACKET_TYPE.NEW_PLAYER:
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
        return [];
    }
}
