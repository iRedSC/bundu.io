import { ServerPacket } from "@bundu/shared/packet_definitions.js";
import { Attributes } from "../components/attributes.js";
import { Inventory, toPacketCursor, toPacketItems } from "../components/inventory.js";
import { PlayerData } from "../components/player.js";
import {
    equipContextName,
    ItemConfigs,
} from "../configs/loaders/items.js";
import type { GameObject, ServerContext } from "../engine";
import {
    applyContextEffects,
    clearContextSource,
    payloadForSubject,
    payloadIsEmpty,
} from "../systems/effect_apply.js";
import { subjectMatchesTarget } from "../systems/effect_targets.js";
import { syncFlags } from "./flags.js";

type EquipSlot = "mainHand" | "offHand" | "helmet";

const SLOT_CONTEXT: Record<
    EquipSlot,
    "whenMainHand" | "whenOffHand" | "whenHelmet"
> = {
    mainHand: "whenMainHand",
    offHand: "whenOffHand",
    helmet: "whenHelmet",
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

function clearSlot(
    target: GameObject,
    data: PlayerData,
    slot: EquipSlot,
    playerPacketManager?: ServerContext["playerPacketManager"]
) {
    data[slot] = undefined;
    clearContextSource(target, SLOT_CONTEXT[slot]);
    if (playerPacketManager) syncFlags(target, playerPacketManager);
}

/** Clear mainhand when it holds `itemId` (e.g. structure stack depleted). */
export function clearMainHandIf(
    target: GameObject,
    itemId: number,
    playerPacketManager?: ServerContext["playerPacketManager"]
) {
    const data = PlayerData.get(target);
    if (!data || data.mainHand !== itemId) return;
    clearSlot(target, data, "mainHand", playerPacketManager);
}

function setSlot(
    target: GameObject,
    data: PlayerData,
    slot: EquipSlot,
    itemId: number,
    playerPacketManager?: ServerContext["playerPacketManager"]
) {
    data[slot] = itemId;
    const config = ItemConfigs.get(itemId);
    const contextName = SLOT_CONTEXT[slot];
    const context = config[contextName];
    if (!context) {
        clearContextSource(target, contextName);
        if (playerPacketManager) syncFlags(target, playerPacketManager);
        return;
    }
    const payload = payloadForSubject(context, (t) =>
        subjectMatchesTarget(target, t)
    );
    if (payloadIsEmpty(payload)) {
        clearContextSource(target, contextName);
    } else {
        applyContextEffects(target, contextName, context, payload);
    }
    if (playerPacketManager) syncFlags(target, playerPacketManager);
}

function toggleSlot(
    target: GameObject,
    data: PlayerData,
    slot: EquipSlot,
    itemId: number,
    playerPacketManager?: ServerContext["playerPacketManager"]
) {
    if (data[slot] === itemId) {
        clearSlot(target, data, slot, playerPacketManager);
        return;
    }
    setSlot(target, data, slot, itemId, playerPacketManager);
}

/**
 * Starve-style equip: selecting an item toggles its equipment slot
 * (wear / main_hand / off_hand). Helmets stay on when switching weapons.
 */
export function selectEquipment(
    target: GameObject,
    itemId: number | undefined,
    playerPacketManager?: ServerContext["playerPacketManager"]
) {
    if (itemId === undefined) return;

    const data = PlayerData.get(target);
    if (!data) return;

    const config = ItemConfigs.get(itemId);
    if (!config.function) return;

    switch (config.function) {
        case "wear":
            toggleSlot(target, data, "helmet", itemId, playerPacketManager);
            break;
        case "main_hand":
            toggleSlot(target, data, "mainHand", itemId, playerPacketManager);
            break;
        case "off_hand":
            toggleSlot(target, data, "offHand", itemId, playerPacketManager);
            break;
        case "building":
            toggleSlot(target, data, "mainHand", itemId, playerPacketManager);
            break;
        default:
            break;
    }
}

/** Unequip gear whose item is no longer in the hotbar. */
export function clearMissingEquipment(
    target: GameObject,
    playerPacketManager?: ServerContext["playerPacketManager"]
) {
    const inv = Inventory.get(target);
    const data = PlayerData.get(target);
    if (!inv || !data) return;

    if (data.mainHand !== undefined && !inventoryHasItem(inv, data.mainHand)) {
        clearSlot(target, data, "mainHand", playerPacketManager);
    }
    if (data.offHand !== undefined && !inventoryHasItem(inv, data.offHand)) {
        clearSlot(target, data, "offHand", playerPacketManager);
    }
    if (data.helmet !== undefined && !inventoryHasItem(inv, data.helmet)) {
        clearSlot(target, data, "helmet", playerPacketManager);
    }
}

export { equipContextName };
