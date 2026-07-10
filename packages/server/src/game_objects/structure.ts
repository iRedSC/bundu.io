import type { ServerPacket } from "@bundu/shared/packet_definitions.js";
import { Physics, Type } from "../components/base.js";
import { GameObject } from "../engine";
import { GameObjectData } from "@bundu/shared/object_types.js";

/**
 * A placed structure / static prop — physics + type only, no harvest/decay data.
 */
export class Structure extends GameObject {
    constructor(physics: Physics, type: Type) {
        super();
        this.add(new Physics(physics)).add(new Type(type));
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
            data: [physics.collisionRadius, type.id],
        };
    }
}
