import type { ServerPacket } from "@bundu/shared/packet_definitions.js";
import { Physics, ResourceData, TileEntity, Type } from "../components/base.js";
import { ResourceConfigs } from "../configs/loaders/resources.js";
import { GameObject } from "../engine";
import { GameObjectData } from "@bundu/shared/object_types.js";
import { deciPacketPos } from "./tile_entity.js";
import { getVariantId } from "@bundu/shared/variant_map.js";

/**
 * A harvestable tile entity (resource node).
 */
export class Resource extends GameObject {
    constructor(physics: Physics, type: Type, tile?: TileEntity, scale = 1) {
        super();

        const config = ResourceConfigs.get(type.id);
        this.add(
            new ResourceData({
                items: structuredClone(config.items),
                decayAt: config.decay,
                lastRegen: 0,
                scale,
            })
        )
            .add(new Physics(physics))
            .add(new Type(type));
        if (tile) this.add(new TileEntity(tile));
    }

    public override getNewObjectPacket(): ServerPacket.LoadObject | void {
        const physics = this.get(Physics);
        const type = this.get(Type);
        const scale = this.get(ResourceData).scale;
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
