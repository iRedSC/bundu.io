import { GroundItemData, Physics } from "../components/base.js";
import { GameObject } from "../engine";
import { GameObjectData } from "@bundu/shared/object_types.js";
import type { ServerPacket } from "@bundu/shared/packet_definitions.js";
import { deciPacketPos } from "./tile_entity.js";

/** A stack that exists in the world and can be picked up by a player. */
export class GroundItem extends GameObject {
    constructor(physics: Physics, item: GroundItemData) {
        super();
        this.add(new Physics(physics)).add(new GroundItemData(item));
    }

    override getNewObjectPacket(): ServerPacket.LoadObject {
        const physics = this.get(Physics);
        const item = this.get(GroundItemData);
        const pos = deciPacketPos(physics);
        return {
            id: this.id,
            x: pos.x,
            y: pos.y,
            rotation: physics.rotation,
            type: GameObjectData.GroundItemType,
            data: [item.itemId, item.amount],
        };
    }
}
