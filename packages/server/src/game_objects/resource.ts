import type { ServerPacket } from "@bundu/shared/packet_definitions.js";
import { Physics, ResourceData, TileEntity, Type } from "../components/base.js";
import { Attributes } from "../components/attributes.js";
import { bindPhysicsScale } from "../components/physics_scale.js";
import { ResourceConfigs } from "../configs/loaders/resources.js";
import { GameObject } from "../engine";
import { GameObjectData } from "@bundu/shared/object_types.js";
import { deciPacketPos } from "./tile_entity.js";
import { getVariantId } from "@bundu/shared/variant_map.js";

/**
 * A harvestable tile entity (resource node) or free-floating corpse.
 * `scale` seeds `physics.scale`; pass an unscaled `physics.collisionRadius` as the base.
 */
export class Resource extends GameObject {
    constructor(physics: Physics, type: Type, tile?: TileEntity, scale = 1) {
        super();

        const config = ResourceConfigs.get(type.id);
        const attributes = new Attributes();
        bindPhysicsScale(attributes.data, physics, scale, physics.collisionRadius);
        this.add(
            new ResourceData({
                quantity: config.quantity,
                maximumQuantity: config.quantity,
                lootTableId: config.lootTable,
                lootSeed: this.id,
                harvestHit: 0,
                decayAt: config.decay,
                lastRegen: 0,
            })
        )
            .add(new Physics(physics))
            .add(new Type(type))
            .add(attributes);
        if (tile) this.add(new TileEntity(tile));
    }

    public override getNewObjectPacket(): ServerPacket.LoadObject | undefined {
        const physics = this.get(Physics);
        const type = this.get(Type);
        const scale = this.get(Attributes).get("physics.scale");
        const pos = deciPacketPos(physics);

        return {
            id: this.id,
            x: pos.x,
            y: pos.y,
            rotation: physics.rotation,
            type: GameObjectData.ResourceNodeType,
            data: [type.id, getVariantId(type.variant), physics.collisionRadius, scale],
        };
    }
}
