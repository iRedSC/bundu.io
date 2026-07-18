import type { ServerPacket } from "@bundu/shared/packet_definitions";
import { DecorationData } from "../components/base.js";
import type { GameObject } from "../engine";

/** Build a LoadDecorations / UnloadDecorations wire tuple. */
export function decorationWire(
    object: GameObject
): ServerPacket.DecorationWire {
    const data = object.get(DecorationData);
    return [
        object.id,
        data.type,
        data.x,
        data.y,
        data.rotation,
        data.scale,
    ];
}
