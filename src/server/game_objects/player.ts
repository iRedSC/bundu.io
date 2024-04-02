import { round } from "../../lib/math.js";
import {
    NewObjectSchema,
    OBJECT_CLASS,
    PACKET_TYPE,
    ServerPacketSchema,
} from "../../shared/enums.js";
import { CalculateCollisions, Physics } from "../components/base.js";
import { PlayerData } from "../components/player.js";
import { GameObject } from "../game_engine/game_object.js";

// Player should have the following properties:
// name, socket, inventory, cosmetics, movement

export class Player extends GameObject {
    constructor(physics: Physics, playerData: PlayerData) {
        super();
        this.add(new Physics(physics));
        this.add(new PlayerData(playerData));
        this.add(new CalculateCollisions({}));

        this.pack[PACKET_TYPE.NEW_OBJECT] = () => {
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

        this.pack[PACKET_TYPE.MOVE_OBJECT] = () => {
            const physics = Physics.get(this).data;
            return [this.id, 50, physics.position.x, physics.position.y];
        };

        this.pack[PACKET_TYPE.ROTATE_OBJECT] = () => {
            const physics = Physics.get(this).data;
            return [this.id, physics.rotation];
        };
    }
}
