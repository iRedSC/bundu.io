import { Physics } from "../components/base.js";
import { FreecamGhostData } from "../components/freecam_ghost.js";
import { GameObject } from "../engine";
import { GameObjectData } from "@bundu/shared/object_types.js";
import { getVariantId } from "@bundu/shared/variant_map.js";
import type { ServerPacket } from "@bundu/shared/packet_definitions.js";
import { deciPacketPos } from "./tile_entity.js";

/** Freecam shared cursor — Physics for pose only (no quadtree / combat). */
export class FreecamGhost extends GameObject {
    constructor(physics: Physics, data: FreecamGhostData) {
        super();
        this.add(new Physics(physics)).add(new FreecamGhostData(data));
    }

    override getNewObjectPacket(): ServerPacket.LoadObject {
        const physics = this.get(Physics);
        const data = this.get(FreecamGhostData);
        const pos = deciPacketPos(physics);
        return {
            id: this.id,
            x: pos.x,
            y: pos.y,
            rotation: 0,
            type: GameObjectData.FreecamGhostType,
            data: [data.name, getVariantId(data.playerSkin)],
        };
    }
}
