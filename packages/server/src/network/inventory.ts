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
    applyContextAttributes,
    clearAttributes,
    payloadForSubject,
} from "../systems/effect_apply.js";
import { subjectMatchesTarget } from "../systems/effect_targets.js";

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

function clearSlot(target: GameObject, data: PlayerData, slot: EquipSlot) {
    data[slot] = undefined;
    clearAttributes(Attributes.get(target), SLOT_CONTEXT[slot]);
}

/** Clear mainhand when it holds `itemId` (e.g. structure stack depleted). */
export function clearMainHandIf(target: GameObject, itemId: number) {
    const data = PlayerData.get(target);
    if (!data || data.mainHand !== itemId) return;
    clearSlot(target, data, "mainHand");
}

function setSlot(
    target: GameObject,
    data: PlayerData,
    slot: EquipSlot,
    itemId: number
) {
    data[slot] = itemId;
    const config = ItemConfigs.get(itemId);
    const contextName = SLOT_CONTEXT[slot];
    const context = config[contextName];
    if (!context) {
        clearAttributes(Attributes.get(target), contextName);
        return;
    }
    const payload = payloadForSubject(context, (t) =>
        subjectMatchesTarget(target, t)
    );
    if (Object.keys(payload.attributes).length === 0) {
        clearAttributes(Attributes.get(target), contextName);
        return;
    }
    applyContextAttributes(target, contextName, context, payload);
}

function toggleSlot(
    target: GameObject,
    data: PlayerData,
    slot: EquipSlot,
    itemId: number
) {
    if (data[slot] === itemId) {
        clearSlot(target, data, slot);
        return;
    }
    setSlot(target, data, slot, itemId);
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
            toggleSlot(target, data, "helmet", itemId);
            break;
        case "main_hand":
            toggleSlot(target, data, "mainHand", itemId);
            break;
        case "off_hand":
            toggleSlot(target, data, "offHand", itemId);
            break;
        case "building":
            // Structures occupy mainhand only; offhand stays put.
            toggleSlot(target, data, "mainHand", itemId);
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

/** Re-resolve equip context effects (e.g. after target-filter changes). */
export function refreshEquipmentEffects(target: GameObject): void {
    const data = PlayerData.get(target);
    if (!data) return;
    if (data.mainHand !== undefined) {
        setSlot(target, data, "mainHand", data.mainHand);
    } else {
        clearAttributes(Attributes.get(target), "whenMainHand");
    }
    if (data.offHand !== undefined) {
        setSlot(target, data, "offHand", data.offHand);
    } else {
        clearAttributes(Attributes.get(target), "whenOffHand");
    }
    if (data.helmet !== undefined) {
        setSlot(target, data, "helmet", data.helmet);
    } else {
        clearAttributes(Attributes.get(target), "whenHelmet");
    }
}

export { equipContextName };
