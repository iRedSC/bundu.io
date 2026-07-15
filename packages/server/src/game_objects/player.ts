import { Attributes } from "../components/attributes.js";
import {
    CalculateCollisions,
    Health,
    Physics,
} from "../components/base.js";
import { bindPhysicsScale } from "../components/physics_scale.js";
import { emptySlots, Inventory } from "../components/inventory.js";
import { PlayerData } from "../components/player.js";
import { Stats } from "../components/stats.js";
import { GameObject } from "../engine";
import { VisibleObjects } from "../components/visible_objects.js";
import { GameObjectData } from "@bundu/shared/object_types.js";
import { getVariantId } from "@bundu/shared/variant_map.js";
import { PLAYER_MOVE_SPEED } from "@bundu/shared/movement";
import { DEFAULT_PLACEMENT_REACH } from "@bundu/shared";
import type { ServerPacket } from "@bundu/shared/packet_definitions.js";
import { deciPacketPos } from "./tile_entity.js";

// Player should have the following properties:
// name, socket, inventory, cosmetics, movement

export class Player extends GameObject {
    constructor(physics: Physics, playerData: PlayerData) {
        super();

        const attributes = new Attributes();
        attributes.data.set("attack.damage", "base", "add", 1);
        attributes.data.set("attack.origin", "base", "add", 30);
        attributes.data.set("attack.reach", "base", "add", 70);
        attributes.data.set("attack.sweep", "base", "add", 50);
        attributes.data.set("attack.speed", "base", "add", 2);
        attributes.data.set("health.max", "base", "add", 200);
        attributes.data.set("health.regen_amount", "base", "add", 10);
        attributes.data.set("hunger.depletion_amount", "base", "add", 10);
        attributes.data.set("hunger.max", "base", "add", 100);
        attributes.data.set(
            "eating.movement_speed_multiplier",
            "base",
            "add",
            1
        );
        // World units per tick at 20 tps.
        attributes.data.set("movement.speed", "base", "add", PLAYER_MOVE_SPEED);
        attributes.data.set(
            "placement.reach",
            "base",
            "add",
            DEFAULT_PLACEMENT_REACH
        );
        attributes.data.set("temperature.max", "base", "add", 200);
        attributes.data.set("water.depletion_amount", "base", "add", 5);
        attributes.data.set("water.max", "base", "add", 100);
        bindPhysicsScale(attributes.data, physics);

        const health = new Health({ value: 200, max: 200, lastRegen: 0 });

        const stats = new Stats();
        stats.data.set("hunger", { value: 100, min: 0, max: 200 });
        stats.data.set("temperature", { value: 100, min: 0, max: 200 });
        stats.data.set("water", { value: 100, min: 0, max: 100 });

        // Sync health.max when modifiers change (including tick-driven expiry).
        attributes.data.addEventListener("health.max", (value) => {
            health.data.max = value;
        });
        health.data.max = attributes.data.get("health.max");

        this.add(new Physics(physics))
            .add(health)
            .add(new PlayerData(playerData))
            .add(new CalculateCollisions())
            .add(
                new Inventory({ slots: emptySlots(), selected: 0, cursor: null })
            )
            .add(attributes)
            .add(stats)
            .add(new VisibleObjects());
    }

    public override getNewObjectPacket(): ServerPacket.LoadObject {
        const physics = this.get(Physics);
        const data = this.get(PlayerData);
        const scale = this.get(Attributes).get("physics.scale");
        const pos = deciPacketPos(physics);
        return {
            id: this.id,
            x: pos.x,
            y: pos.y,
            rotation: physics.rotation,
            type: GameObjectData.PlayerType,
            data: [
                data.name,
                data.mainHand,
                data.offHand,
                data.helmet,
                data.backpack ?? false,
                getVariantId(data.playerSkin),
                physics.collisionRadius,
                scale,
            ],
        };
    }
}
