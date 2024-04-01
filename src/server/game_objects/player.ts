import { round } from "../../lib/math.js";
import {
    NewObjectSchema,
    OBJECT_CLASS,
    PACKET_TYPE,
    ServerPacketSchema,
} from "../../shared/enums.js";
import { Physics } from "../components/base.js";
import { PlayerData } from "../components/player.js";
import { GameObject } from "../game_engine/game_object.js";

// Player should have the following properties:
// name, socket, inventory, cosmetics, movement

export class Player extends GameObject {
    constructor(physics: Physics, playerData: PlayerData) {
        super();
        this.add(new Physics(physics));
        this.add(new PlayerData(playerData));

        this.pack.new = () => {
            const physics = Physics.get(this).data;
            const playerData = PlayerData.get(this).data;
            return [
                OBJECT_CLASS.PLAYER,
                [
                    this.id,
                    physics.position.x,
                    physics.position.y,
                    physics.rotation,
                    playerData.name,
                    playerData.selectedItem,
                    playerData.helmet,
                    playerData.playerSkin,
                    playerData.backpackSkin,
                    playerData.backpack,
                ],
            ];
        };

        this.pack.move = () => {
            const physics = Physics.get(this).data;
            return [this.id, 50, physics.position.x, physics.position.y];
        };

        this.pack.rotate = () => {
            const physics = Physics.get(this).data;
            return [this.id, physics.rotation];
        };
    }
}

// move() {
//     if (this.moveDir[0] === 0 && this.moveDir[1] === 0) {
//         return false;
//     }
//     const newX = this.position.x - this.moveDir[0];
//     const newY = this.position.y - this.moveDir[1];
//     const target = moveToward(this.position, { x: newX, y: newY }, 10);
//     this.setPosition(target.x, target.y);
//     return true;
// }
