import { ServerPacket } from "@bundu/shared/packet_definitions.js";
import { Flags } from "../components/flags.js";
import type { GameObject, ServerContext } from "../engine";

const lastSent = new Map<number, string>();

function signature(flags: number[]): string {
    return flags.join(",");
}

/** Send effective flags to the owning client when the set changes. */
export function syncFlags(
    target: GameObject,
    playerPacketManager: ServerContext["playerPacketManager"],
    force = false
): void {
    const data = Flags.get(target);
    const flags = data?.values() ?? [];
    const sig = signature(flags);
    if (!force && lastSent.get(target.id) === sig) return;
    lastSent.set(target.id, sig);
    playerPacketManager.set(target.id, ServerPacket.UpdateFlags, { flags });
}

export function clearFlagSync(playerId: number): void {
    lastSent.delete(playerId);
}
