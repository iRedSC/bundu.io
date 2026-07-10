import { Health } from "../components/base.js";
import { Stats } from "../components/stats.js";
import type { GameObject } from "../engine";
import { ServerPacket } from "@bundu/shared/packet_definitions.js";
import { playerPacketManager } from "./managers.js";

/** Owning systems emit vitals directly — no PacketSystem bridge. */
export function emitVitals(target: GameObject) {
    const health = Health.get(target);
    const stats = Stats.get(target);
    if (!health || !stats) return;

    playerPacketManager.set(target.id, ServerPacket.UpdateVitals, {
        health: health.value,
        hunger: stats.get("hunger").value,
        heat: stats.get("temperature").value,
    });
}
