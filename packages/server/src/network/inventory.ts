import { ServerPacket } from "@bundu/shared/packet_definitions.js";
import {
    AttributeList,
    Attributes,
    type AttributeType,
} from "../components/attributes.js";
import { Inventory, toPacketCursor, toPacketItems } from "../components/inventory.js";
import { PlayerData } from "../components/player.js";
import { ItemConfigs, type ItemAttribute } from "../configs/loaders/items.js";
import type { GameObject, ServerContext } from "../engine";

const KNOWN_ATTRIBUTES = new Set<string>(AttributeList);

type EquipSlot = "mainHand" | "offHand" | "helmet";

const SLOT_ATTR_ID: Record<EquipSlot, string> = {
    mainHand: "main_hand",
    offHand: "off_hand",
    helmet: "helmet",
};

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

function inventoryHasItem(inv: Inventory, itemId: number): boolean {
    return inv.slots.some((stack) => stack?.id === itemId);
}

function applySlotAttributes(
    target: GameObject,
    slotId: string,
    attrs: Record<string, ItemAttribute>
) {
    const attributes = Attributes.get(target);
    if (!attributes) return;

    attributes.clear(slotId);
    for (const [type, attr] of Object.entries(attrs)) {
        if (!KNOWN_ATTRIBUTES.has(type)) continue;
        attributes.set(type as AttributeType, slotId, attr.op, attr.value);
    }
}

function clearSlot(target: GameObject, data: PlayerData, slot: EquipSlot) {
    data[slot] = undefined;
    Attributes.get(target)?.clear(SLOT_ATTR_ID[slot]);
}

function setSlot(
    target: GameObject,
    data: PlayerData,
    slot: EquipSlot,
    itemId: number,
    attrs: Record<string, ItemAttribute>
) {
    data[slot] = itemId;
    applySlotAttributes(target, SLOT_ATTR_ID[slot], attrs);
}

function toggleSlot(
    target: GameObject,
    data: PlayerData,
    slot: EquipSlot,
    itemId: number,
    attrs: Record<string, ItemAttribute>
) {
    if (data[slot] === itemId) {
        clearSlot(target, data, slot);
        return;
    }
    setSlot(target, data, slot, itemId, attrs);
}

/**
 * Starve-style equip: selecting an item toggles its equipment slot
 * (wear / main_hand / off_hand). Helmets stay on when switching weapons.
 */
export function selectEquipment(target: GameObject, itemId: number | undefined) {
    if (itemId === undefined) return;

    const data = PlayerData.get(target);
    if (!data) return;

    const config = ItemConfigs.get(itemId);
    if (!config.function) return;

    switch (config.function) {
        case "wear":
            toggleSlot(target, data, "helmet", itemId, config.attributes);
            break;
        case "main_hand":
            toggleSlot(target, data, "mainHand", itemId, config.attributes);
            break;
        case "off_hand":
            toggleSlot(target, data, "offHand", itemId, config.attributes);
            break;
        default:
            break;
    }
}

/** Unequip gear whose item is no longer in the hotbar. */
export function clearMissingEquipment(target: GameObject) {
    const inv = Inventory.get(target);
    const data = PlayerData.get(target);
    if (!inv || !data) return;

    if (data.mainHand !== undefined && !inventoryHasItem(inv, data.mainHand)) {
        clearSlot(target, data, "mainHand");
    }
    if (data.offHand !== undefined && !inventoryHasItem(inv, data.offHand)) {
        clearSlot(target, data, "offHand");
    }
    if (data.helmet !== undefined && !inventoryHasItem(inv, data.helmet)) {
        clearSlot(target, data, "helmet");
    }
}
