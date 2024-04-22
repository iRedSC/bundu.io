import { round } from "../../lib/math.js";
import { degrees } from "../../lib/transforms.js";
import { OBJECT_CLASS, PACKET } from "../../shared/enums.js";
import { CalculateCollisions, Flags, Physics } from "../components/base.js";
import { AttackData, Health } from "../components/combat.js";
import { Inventory, PlayerData } from "../components/player.js";
import { GameObject } from "../game_engine/game_object.js";

// Player should have the following properties:
// name, socket, inventory, cosmetics, movement

export class Player extends GameObject {
    constructor(physics: Physics, playerData: PlayerData) {
        super();

        this.add(new AttackData({ speed: 10, damage: 10, reach: 5 }))
            .add(new Physics(physics))
            .add(new PlayerData(playerData))
            .add(new CalculateCollisions({}))
            .add(new Inventory({ slots: 10, items: new Map() }))
            .add(new Flags(new Set()))
            .add(new Health({ max: 200, value: 200 }));

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
    }
}
