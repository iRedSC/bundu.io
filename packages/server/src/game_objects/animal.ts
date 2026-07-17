import { GameObject } from "../engine/game_object.js";
import { AnimalData, Health, Living, Physics, CalculateCollisions, Type } from "../components/base.js";
import { Attributes } from "../components/attributes.js";
import { bindPhysicsScale } from "../components/physics_scale.js";
import { AnimalConfigs } from "../configs/loaders/animals.js";
import { GameObjectData } from "@bundu/shared/object_types.js";
import type { ServerPacket } from "@bundu/shared/packet_definitions.js";
import { deciPacketPos } from "./tile_entity.js";
import { TILE_SIZE } from "@bundu/shared/tiles.js";

export class Animal extends GameObject {
    constructor(type: Type, physics: Physics) {
        super();
        const config = AnimalConfigs.get(type.id);
        const health = { value: config.health, max: config.health, lastRegen: 0 };
        const attributes = new Attributes();
        const baseRadius = TILE_SIZE / 2;
        // scale 1 → diameter = 1 tile (radius = TILE_SIZE / 2)
        attributes.data.set("attack.reach", "base", "add", config.attack_reach);
        attributes.data.addEventListener("physics.scale", (scale) => {
            attributes.data.set("attack.reach", "body", "add", baseRadius * scale);
        });
        bindPhysicsScale(attributes.data, physics, config.scale, baseRadius);
        this.add(new Type(type))
            .add(new Physics(physics))
            .add(new Health(health))
            .add(new Living())
            .add(new CalculateCollisions())
            .add(attributes)
            .add(new AnimalData({
                type: type.id,
                home: { x: physics.position.x, y: physics.position.y },
                path: [],
                state: "idle",
                roamPhase: "home",
                stateUntil: 0,
                nextThinkAt: 0,
                nextAttackAt: 0,
                nextAggroCheckAt: 0,
                lostAggroUntil: 0,
            }));
    }

    override getNewObjectPacket(): ServerPacket.LoadObject {
        const physics = this.get(Physics);
        const health = this.get(Health);
        const type = this.get(Type);
        const scale = this.get(Attributes).get("physics.scale");
        const pos = deciPacketPos(physics);
        return {
            id: this.id, x: pos.x, y: pos.y, rotation: 0,
            type: GameObjectData.AnimalType,
            data: [type.id, physics.collisionRadius, health.value, health.max, scale],
        };
    }
}
