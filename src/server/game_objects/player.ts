import { round } from "../../lib/math.js";
import { degrees } from "../../lib/transforms.js";
import { OBJECT_CLASS, PACKET } from "../../shared/enums.js";
import { Attributes } from "../components/attributes.js";
import { CalculateCollisions, Flags, Physics } from "../components/base.js";
import { Inventory } from "../components/inventory.js";
import { PlayerData } from "../components/player.js";
import { Stats } from "../components/stats.js";
import { GameObject } from "../game_engine/game_object.js";

// Player should have the following properties:
// name, socket, inventory, cosmetics, movement

export class Player extends GameObject {
    constructor(physics: Physics, playerData: PlayerData) {
        super();

        const attributes = new Attributes();
        attributes.data.set("attack.damage", "base", "add", 1);
        attributes.data.set("attack.origin", "base", "add", 10);
        attributes.data.set("attack.reach", "base", "add", 15);
        attributes.data.set("attack.sweep", "base", "add", 5);
        attributes.data.set("attack.speed", "base", "add", 2);
        attributes.data.set("health.max", "base", "add", 200);
        attributes.data.set("health.regen_amount", "base", "add", 10);
        attributes.data.set("hunger.depletion_amount", "base", "add", 10);
        attributes.data.set("hunger.max", "base", "add", 100);
        attributes.data.set("movement.speed", "base", "add", 0);
        attributes.data.set("temperature.max", "base", "add", 200);
        attributes.data.set("water.depletion_amount", "base", "add", 5);
        attributes.data.set("water.max", "base", "add", 100);

        const stats = new Stats();
        stats.data.set("health", { value: 200, min: 0, max: 200 });
        stats.data.set("hunger", { value: 100, min: 0, max: 100 });
        stats.data.set("temperature", { value: 100, min: 0, max: 200 });
        stats.data.set("water", { value: 100, min: 0, max: 100 });

        attributes.data.addEventListener("health.max", (value) => {
            stats.data.get("health").max = value;
            console.log(stats.data.get("health").max);
        });

        this.add(new Physics(physics))
            .add(new PlayerData(playerData))
            .add(new CalculateCollisions())
            .add(new Inventory({ slots: 10, items: new Map() }))
            .add(new Flags())
            .add(attributes)
            .add(stats);

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
                round(physics.position.x, 2),
                round(physics.position.y, 2),
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
