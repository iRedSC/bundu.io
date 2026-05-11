import type { ServerPacket } from "@shared/packet_definitions.js";
import { Physics, ResourceData, Type } from "../components/base.js";
import { ResourceConfigs } from "../configs/loaders/resources.js";
import { GameObject } from "@ioengine/server";
import { GameObjectData } from "@shared/object_types.js";

/**
 * A resource node that gives an item when hurt.
 */
export class Resource extends GameObject {
    constructor(physics: Physics, type: Type) {
        super();

        const config = ResourceConfigs.get(type.id);
        this.add(
            new ResourceData({
                items: structuredClone(config.items),
                decayAt: config.decay,
                lastRegen: 0,
            })
        )
            .add(new Physics(physics))
            .add(new Type(type));
    }

    public override getNewObjectPacket(): ServerPacket.LoadObject | void {
        const physics = this.get(Physics);
        const type = this.get(Type);

        return {
            id: this.id,
            x: physics.position.x,
            y: physics.position.y,
            rotation: physics.rotation,
            type: GameObjectData.ResourceNodeType,
            data: [physics.size, type.id],
        };
    }
}
