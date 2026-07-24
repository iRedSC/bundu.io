import { ServerPacket } from "@bundu/shared/packet_definitions.js";
import type { LockSlot } from "@bundu/shared/item_lock";
import {
    addItem,
    ensureSlotCapacity,
    Inventory,
    slotCapacityFor,
    toPacketCursor,
    toPacketItems,
} from "../components/inventory.js";
import { PlayerData } from "../components/player.js";
import { ItemConfigs } from "../configs/loaders/items.js";
import type { GameObject, ServerContext, World } from "../engine";
import {
    applyContextEffects,
    clearContextSource,
    payloadForSubject,
    payloadIsEmpty,
} from "../systems/effect_apply.js";
import { subjectMatchesTarget } from "../systems/effect_targets.js";
import { syncFlags } from "./flags.js";
import {
    emitItemLocks,
    isActionLocked,
    runEquipEvents,
    type EquipEventContext,
} from "./item_locks.js";

type EquipSlot = "mainHand" | "offHand" | "helmet";

/** Attribute source ids stay per-slot so three pieces of gear don't clobber. */
const SLOT_SOURCE: Record<EquipSlot, string> = {
    mainHand: "whenEquipped:mainHand",
    offHand: "whenEquipped:offHand",
    helmet: "whenEquipped:helmet",
};

export type SelectEquipmentContext = {
    world: World;
    playerPacketManager: ServerContext["playerPacketManager"];
    /** Run pack-authored command lines (onEquip / onUnequip). */
    runCommand?: (player: GameObject, commandLine: string) => void;
};

/** Build equip context from a world. */
export function equipContext(
    world: World,
    extras: Pick<SelectEquipmentContext, "runCommand"> = {}
): SelectEquipmentContext {
    return {
        world,
        playerPacketManager: world.context.playerPacketManager,
        runCommand: extras.runCommand,
    };
}

function equipEventCtx(
    target: GameObject,
    ctx: SelectEquipmentContext
): EquipEventContext {
    return {
        world: ctx.world,
        now: ctx.world.gameTime,
        runCommand: (line) => ctx.runCommand?.(target, line),
    };
}

/** Unlock backpack state and grow inventory by one hotbar row. */
export function grantBackpack(target: GameObject): boolean {
    const data = PlayerData.get(target);
    const inv = Inventory.get(target);
    if (!data || !inv || data.backpack) return false;
    data.backpack = true;
    ensureSlotCapacity(inv, slotCapacityFor(true));
    return true;
}

/**
 * Give items to a player. Backpack items unlock capacity instead of entering
 * inventory (and are never left as leftover stacks).
 * Returns how many could not fit (0 for backpack grants).
 */
export function receiveItem(
    target: GameObject,
    itemId: number,
    count: number
): number {
    if (count <= 0) return 0;
    if (ItemConfigs.get(itemId).function === "backpack") {
        grantBackpack(target);
        return 0;
    }
    const inv = Inventory.get(target);
    if (!inv) return count;
    return addItem(inv, itemId, count);
}

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
    ctx?: SelectEquipmentContext
) {
    const previous = data[slot];
    data[slot] = undefined;
    clearContextSource(target, SLOT_SOURCE[slot]);
    if (ctx?.playerPacketManager) syncFlags(target, ctx.playerPacketManager);

    if (previous !== undefined && ctx) {
        const events = ItemConfigs.get(previous).onUnequip;
        const locksChanged = runEquipEvents(
            target,
            events,
            equipEventCtx(target, ctx)
        );
        if (locksChanged) {
            emitItemLocks(target, ctx.world.gameTime, ctx.playerPacketManager);
        }
    }
}

/** Clear mainhand when it holds `itemId` (e.g. structure stack depleted). */
export function clearMainHandIf(
    target: GameObject,
    itemId: number,
    ctx?: SelectEquipmentContext
) {
    const data = PlayerData.get(target);
    if (!data || data.mainHand !== itemId) return;
    clearSlot(target, data, "mainHand", ctx);
}

function setSlot(
    target: GameObject,
    data: PlayerData,
    slot: EquipSlot,
    itemId: number,
    ctx?: SelectEquipmentContext
) {
    const previous = data[slot];
    if (previous !== undefined && previous !== itemId && ctx) {
        // Replacing another item counts as unequipping it first.
        const unequip = ItemConfigs.get(previous).onUnequip;
        const locksChanged = runEquipEvents(
            target,
            unequip,
            equipEventCtx(target, ctx)
        );
        if (locksChanged) {
            emitItemLocks(target, ctx.world.gameTime, ctx.playerPacketManager);
        }
    }

    data[slot] = itemId;
    const config = ItemConfigs.get(itemId);
    const sourceId = SLOT_SOURCE[slot];
    const context = config.whenEquipped;
    if (!context) {
        clearContextSource(target, sourceId);
        if (ctx?.playerPacketManager) syncFlags(target, ctx.playerPacketManager);
    } else {
        const payload = payloadForSubject(context, (t) =>
            subjectMatchesTarget(target, t, { executor: target })
        );
        if (payloadIsEmpty(payload)) {
            clearContextSource(target, sourceId);
        } else {
            applyContextEffects(target, sourceId, context, payload);
        }
        if (ctx?.playerPacketManager) syncFlags(target, ctx.playerPacketManager);
    }

    if (ctx && previous !== itemId) {
        const locksChanged = runEquipEvents(
            target,
            config.onEquip,
            equipEventCtx(target, ctx)
        );
        if (locksChanged) {
            emitItemLocks(target, ctx.world.gameTime, ctx.playerPacketManager);
        }
    }
}

function equipSlotToLockSlot(slot: EquipSlot): LockSlot {
    switch (slot) {
        case "mainHand":
            return "mainhand";
        case "offHand":
            return "offhand";
        case "helmet":
            return "helmet";
    }
}

function toggleSlot(
    target: GameObject,
    data: PlayerData,
    slot: EquipSlot,
    itemId: number,
    ctx?: SelectEquipmentContext
) {
    const now = ctx?.world.gameTime ?? 0;
    const lockSlot = equipSlotToLockSlot(slot);
    if (data[slot] === itemId) {
        if (ctx && isActionLocked(target, itemId, "unequip", now, lockSlot))
            return;
        clearSlot(target, data, slot, ctx);
        return;
    }
    if (ctx && isActionLocked(target, itemId, "equip", now, lockSlot)) return;
    const current = data[slot];
    if (
        ctx &&
        current !== undefined &&
        current !== itemId &&
        isActionLocked(target, current, "unequip", now, lockSlot)
    ) {
        return;
    }
    setSlot(target, data, slot, itemId, ctx);
}

/**
 * Starve-style equip: selecting an item toggles its equipment slot
 * (wear / main_hand / off_hand). Helmets stay on when switching weapons.
 */
export function selectEquipment(
    target: GameObject,
    itemId: number | undefined,
    ctx?: SelectEquipmentContext
) {
    if (itemId === undefined) return;

    const data = PlayerData.get(target);
    if (!data) return;

    const config = ItemConfigs.get(itemId);
    if (!config.function) return;

    switch (config.function) {
        case "wear":
            toggleSlot(target, data, "helmet", itemId, ctx);
            break;
        case "main_hand":
            toggleSlot(target, data, "mainHand", itemId, ctx);
            break;
        case "off_hand":
            toggleSlot(target, data, "offHand", itemId, ctx);
            break;
        case "building":
            toggleSlot(target, data, "mainHand", itemId, ctx);
            break;
        default:
            break;
    }
}

/** Unequip gear whose item is no longer in the hotbar. */
export function clearMissingEquipment(
    target: GameObject,
    ctx?: SelectEquipmentContext
) {
    const inv = Inventory.get(target);
    const data = PlayerData.get(target);
    if (!inv || !data) return;

    // Forced unequip (drop/consume) bypasses lock — the item is gone.
    if (data.mainHand !== undefined && !inventoryHasItem(inv, data.mainHand)) {
        clearSlot(target, data, "mainHand", ctx);
    }
    if (data.offHand !== undefined && !inventoryHasItem(inv, data.offHand)) {
        clearSlot(target, data, "offHand", ctx);
    }
    if (data.helmet !== undefined && !inventoryHasItem(inv, data.helmet)) {
        clearSlot(target, data, "helmet", ctx);
    }
}
