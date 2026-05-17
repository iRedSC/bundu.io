import { ServerPacket } from "@shared/packet_definitions.js";
import { Attributes } from "../components/attributes.js";
import {
    CalculateCollisions,
    Flags,
    Health,
    Physics,
} from "../components/base.js";
import { Inventory } from "../components/inventory.js";
import { PlayerData } from "../components/player.js";
import { Stats } from "../components/stats.js";
import { GameObject } from "@ioengine/server";
import {
    playerPacketManager,
    worldPacketManager,
} from "../network/managers.js";
import { VisibleObjects } from "../components/visible_objects.js";
import { GameObjectData } from "@shared/object_types.js";

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

        const health = new Health({ value: 200, max: 200 });

        const stats = new Stats();
        stats.data.set("hunger", { value: 100, min: 0, max: 100 });
        stats.data.set("temperature", { value: 100, min: 0, max: 200 });
        stats.data.set("water", { value: 100, min: 0, max: 100 });

        attributes.data.addEventListener("health.max", (value) => {
            health.data.max = value;
        });

        this.add(new Physics(physics))
            .add(health)
            .add(new PlayerData(playerData))
            .add(new CalculateCollisions())
            .add(new Inventory({ slots: 10, items: new Map() }))
            .add(new Flags())
            .add(attributes)
            .add(stats)
            .add(new VisibleObjects());
    }

    public override getNewObjectPacket() {
        const physics = this.get(Physics);
        const data = this.get(PlayerData);
        const packet = {
            id: this.id,
            x: physics.position.x,
            y: physics.position.y,
            rotation: physics.rotation,
            type: GameObjectData.PlayerType,
            data: [
                data.name,
                data.mainHand,
                data.offHand,
                data.helmet,
                data.backpack ?? false,
                data.playerSkin,
                physics.collisionRadius,
            ],
        };
        return packet;
    }
}
