import { Physics } from "../components/base.js";
import { AnonProxy } from "../components/anon_proxy.js";
import { GameObject } from "../engine";
import { GameObjectData } from "@bundu/shared/object_types.js";
import type { ServerPacket } from "@bundu/shared/packet_definitions.js";
import { deciPacketPos } from "./tile_entity.js";

/** Peer-facing scrubbed body — Physics only (no inventory / intent). */
export class AnonymousPlayer extends GameObject {
    constructor(physics: Physics, proxy: AnonProxy) {
        super();
        this.add(new Physics(physics)).add(new AnonProxy(proxy));
    }

    override getNewObjectPacket(): ServerPacket.LoadObject {
        const physics = this.get(Physics);
        const proxy = this.get(AnonProxy);
        const pos = deciPacketPos(physics);
        return {
            id: this.id,
            x: pos.x,
            y: pos.y,
            rotation: physics.rotation,
            type: GameObjectData.PlayerType,
            data: [
                proxy.name,
                proxy.mainHand,
                proxy.offHand,
                proxy.helmet,
                proxy.backpack,
                proxy.skinVariant,
                proxy.collisionRadius,
                proxy.scale,
            ],
        };
    }
}
