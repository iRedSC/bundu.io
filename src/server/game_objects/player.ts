import { distance, lerp, moveToward } from "../../lib/transforms.js";
import { GameWS } from "../websockets.js";
import { WorldObject } from "./base.js";
import { round } from "../../lib/math.js";
import { PACKET_TYPE } from "../../shared/enums.js";
import { UpdateHandler } from "./update_handler.js";
import { UPDATE_PRIORITY } from "pixi.js";

// Player should have the following properties:
// name, socket, inventory, cosmetics, movement

class Cosmetics {
    skin: number;
    backpack: number;
    book: number;
}

class Inventory {
    slots: number;
    items: Map<string, number>;
    hand: string;
    head: string;
}

export class Player extends WorldObject {
    name: string;
    socket: GameWS;
    moveDir: [number, number];
    attacking: number;
    updateHandler: UpdateHandler;

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
        this.updateHandler = new UpdateHandler();
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
                return [this.id, 50, round(this.x, 1), round(this.y, 1)];
            case PACKET_TYPE.ROTATE_OBJECT:
                return [this.id, this.rotation];
            case PACKET_TYPE.NEW_PLAYER:
                return [
                    this.id,
                    round(this.x, 1),
                    round(this.y, 1),
                    round(this.rotation, 3),
                    this.name,
                    0,
                    0,
                    0,
                    0,
                ];
        }
        return [];
    }
}
