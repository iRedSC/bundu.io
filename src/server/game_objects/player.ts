import { round } from "../../lib/math.js";
import { degrees } from "../../lib/transforms.js";
import { OBJECT_CLASS, PACKET } from "../../shared/enums.js";
import { Attributes } from "../components/attributes.js";
import { CalculateCollisions, Flags, Physics } from "../components/base.js";
import { Health } from "../components/combat.js";
import { Inventory } from "../components/inventory.js";
import { PlayerData } from "../components/player.js";
import { GameObject } from "../game_engine/game_object.js";

// Player should have the following properties:
// name, socket, inventory, cosmetics, movement

export class Player extends GameObject {
    constructor(physics: Physics, playerData: PlayerData) {
        super();

        this.add(new Physics(physics))
            .add(new PlayerData(playerData))
            .add(new CalculateCollisions())
            .add(new Inventory({ slots: 10, items: new Map() }))
            .add(new Flags())
            .add(new Health({ max: 200, value: 200 }))
            .add(new Attributes());

        this.pack[PACKET.SERVER.NEW_OBJECT] = () => {
            const physics = Physics.get(this);
            const playerData = PlayerData.get(this);
            return [
                OBJECT_CLASS.PLAYER,
                [
                    this.id,
                    physics.position.x,
                    physics.position.y,
                    round(degrees(physics.rotation)),
                    playerData.name,
                    playerData.mainHand,
                    playerData.offHand,
                    playerData.helmet,
                    playerData.playerSkin,
                    playerData.backpackSkin,
                    playerData.backpack,
                ],
            ];
        };

        this.pack[PACKET.SERVER.MOVE_OBJECT] = () => {
            const physics = Physics.get(this);
            return [
                this.id,
                100,
                round(physics.position.x),
                round(physics.position.y),
            ];
        };

        this.pack[PACKET.SERVER.ROTATE_OBJECT] = () => {
            const physics = Physics.get(this);
            return [this.id, round(degrees(physics.rotation))];
        };

        this.pack[PACKET.SERVER.UPDATE_GEAR] = () => {
            const data = this.get(PlayerData);
            return [
                this.id,
                data.mainHand || -1,
                data.offHand || -1,
                data.helmet || -1,
                data.backpack || false,
            ];
        };
    }
}
