import {
    Attributes,
    type AttributeType,
} from "../components/attributes.js";
import {
    CalculateCollisions,
    Health,
    Living,
    Physics,
} from "../components/base.js";
import { bindPhysicsScale } from "../components/physics_scale.js";
import { emptySlots, Inventory } from "../components/inventory.js";
import { ItemLocks } from "../components/item_locks.js";
import { Flags } from "../components/flags.js";
import { PlayerData } from "../components/player.js";
import { Stats } from "../components/stats.js";
import { GameObject } from "../engine";
import { VisibleObjects } from "../components/visible_objects.js";
import { GameObjectData } from "@bundu/shared/object_types.js";
import { getVariantId } from "@bundu/shared/variant_map.js";
import type { ServerPacket } from "@bundu/shared/packet_definitions.js";
import { deciPacketPos } from "./tile_entity.js";
import { gameplayConfig } from "../configs/gameplay.js";

// Player should have the following properties:
// name, socket, inventory, cosmetics, movement

export class Player extends GameObject {
    constructor(physics: Physics, playerData: PlayerData) {
        super();

        const config = gameplayConfig().player;
        const attributes = new Attributes();
        for (const [attribute, value] of Object.entries(config.baseAttributes)) {
            attributes.data.set(
                attribute as AttributeType,
                "base",
                "addBase",
                value
            );
        }
        bindPhysicsScale(attributes.data, physics);

        const health = new Health({
            value: config.initialHealth,
            max: config.baseAttributes["health.max"] ?? config.initialHealth,
            lastRegen: 0,
        });

        const stats = new Stats();
        for (const [name, value] of Object.entries(config.initialStats)) {
            stats.data.set(name as keyof typeof config.initialStats, value);
        }

        // Sync health.max when modifiers change (including tick-driven expiry).
        attributes.data.addEventListener("health.max", (value) => {
            health.data.max = value;
        });
        health.data.max = attributes.data.get("health.max");

        this.add(new Physics(physics))
            .add(health)
            .add(new Living())
            .add(new PlayerData(playerData))
            .add(new ItemLocks())
            .add(new CalculateCollisions())
            .add(
                new Inventory({ slots: emptySlots(), selected: 0, cursor: null })
            )
            .add(attributes)
            .add(new Flags())
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
                false,
            ],
        };
    }
}
