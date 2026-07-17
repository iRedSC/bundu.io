import type { ServerPacket } from "@bundu/shared/packet_definitions";
import { GroundData } from "../components/base.js";
import type { GameObject } from "../engine";

/** Build a LoadGround / UnloadGround wire tuple from a live ground object. */
export function groundWire(object: GameObject): ServerPacket.GroundWire {
    const data = object.get(GroundData);
    const [type, x, y, w, h] = data.createPacket();
    return [
        object.id,
        type,
        Math.round(x),
        Math.round(y),
        Math.round(w),
        Math.round(h),
    ];
}
