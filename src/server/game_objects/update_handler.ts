import { PACKET_TYPE } from "../../shared/enums.js";
import { GameWS } from "../websockets.js";
import { WorldObject } from "./base.js";

export class UpdateHandler {
    move: WorldObject[];
    rotate: WorldObject[];

    constructor() {
        this.move = [];
        this.rotate = [];
    }

    send(to: GameWS) {
        const MOVE_OBJECT = [PACKET_TYPE.MOVE_OBJECT];
        for (let object of this.move) {
            MOVE_OBJECT.push(...object.pack(PACKET_TYPE.MOVE_OBJECT));
        }

        const ROTATE_OBJECT = [PACKET_TYPE.ROTATE_OBJECT];
        for (let object of this.rotate) {
            ROTATE_OBJECT.push(...object.pack(PACKET_TYPE.ROTATE_OBJECT));
        }

        if (MOVE_OBJECT.length > 1) {
            to.send(JSON.stringify(MOVE_OBJECT));
        }
        if (ROTATE_OBJECT.length > 1) {
            to.send(JSON.stringify(ROTATE_OBJECT));
        }
    }

    clear() {
        this.move = [];
        this.rotate = [];
    }
}
