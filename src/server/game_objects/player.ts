import { round } from "../../lib/math.js";
import { degrees } from "../../lib/transforms.js";
import { OBJECT_CLASS, PACKET_TYPE } from "../../shared/packet_enums.js";
import { CalculateCollisions, Physics } from "../components/base.js";
import { AttackData } from "../components/combat.js";
import { Inventory, PlayerData } from "../components/player.js";
import { GameObject } from "../game_engine/game_object.js";

// Player should have the following properties:
// name, socket, inventory, cosmetics, movement

export class Player extends GameObject {
    constructor(physics: Physics, playerData: PlayerData) {
        super();

        this.add(new AttackData({ speed: 10, damage: 1, reach: 5 }));
        this.add(new Physics(physics));
        this.add(new PlayerData(playerData));
        this.add(new CalculateCollisions({}));
        this.add(new Inventory({ slots: 10, items: new Map() }));

        this.pack[PACKET_TYPE.NEW_OBJECT] = () => {
            const physics = Physics.get(this).data;
            const playerData = PlayerData.get(this).data;
            return [
                OBJECT_CLASS.PLAYER,
                [
                    this.id,
                    physics.position.x,
                    physics.position.y,
                    round(degrees(physics.rotation)),
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
            return [this.id, round(degrees(physics.rotation))];
        };
    }
}
