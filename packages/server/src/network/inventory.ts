import { ServerPacket } from "@bundu/shared/packet_definitions.js";
import { Inventory, toPacketCursor, toPacketItems } from "../components/inventory.js";
import { PlayerData } from "../components/player.js";
import type { GameObject, ServerContext } from "../engine";

/** Sync hotbar to the owning client. */
export function emitInventory(
    target: GameObject,
    playerPacketManager: ServerContext["playerPacketManager"]
) {
    const inv = Inventory.get(target);
    if (!inv) return;

    playerPacketManager.set(target.id, ServerPacket.UpdateInventory, {
        items: toPacketItems(inv),
        cursor: toPacketCursor(inv),
    });
}

/** Broadcast held items to anyone who can see this player. */
export function emitEquipment(
    target: GameObject,
    worldPacketManager: ServerContext["worldPacketManager"]
) {
    const data = PlayerData.get(target);
    if (!data) return;

    worldPacketManager.set(ServerPacket.UpdateEquipment, {
        id: target.id,
        mainhand: data.mainHand ?? -1,
        offhand: data.offHand ?? -1,
        helmet: data.helmet ?? -1,
        backpack: data.backpack ?? false,
    });
}

/** Point mainHand at the selected slot (or clear it). */
export function syncMainHand(target: GameObject) {
    const inv = Inventory.get(target);
    const data = PlayerData.get(target);
    if (!inv || !data) return;

    data.mainHand = inv.slots[inv.selected]?.id;
}
