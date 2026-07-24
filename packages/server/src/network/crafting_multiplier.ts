import { ServerPacket } from "@bundu/shared/packet_definitions.js";
import { Attributes } from "../components/attributes.js";
import type { GameObject, ServerContext } from "../engine";

const lastSent = new Map<number, number>();

/** Send effective `crafting.multiplier` to the owning client when it changes. */
export function syncCraftingMultiplier(
    target: GameObject,
    playerPacketManager: ServerContext["playerPacketManager"],
    force = false
): void {
    const multiplier =
        Attributes.get(target)?.get("crafting.multiplier") ?? 1;
    if (!force && lastSent.get(target.id) === multiplier) return;
    lastSent.set(target.id, multiplier);
    playerPacketManager.set(target.id, ServerPacket.UpdateCraftingMultiplier, {
        multiplier,
    });
}

export function clearCraftingMultiplierSync(playerId: number): void {
    lastSent.delete(playerId);
}
