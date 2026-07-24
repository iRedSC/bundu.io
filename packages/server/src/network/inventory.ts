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
    applyResolvedEquipEvents,
    emitItemLocks,
    isItemLocked,
    resolveEquipEvents,
    runResolvedEquipCommands,
    type EquipEventContext,
    type ResolvedEquipEvent,
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
    ctx: SelectEquipmentContext
): EquipEventContext {
    return {
        world: ctx.world,
        now: ctx.world.gameTime,
        runCommand: (target, line) => ctx.runCommand?.(target, line),
    };
}

function commitEquipEvents(
    resolved: readonly ResolvedEquipEvent[],
    ctx: SelectEquipmentContext
): void {
    for (const target of applyResolvedEquipEvents(
        resolved,
        ctx.world.gameTime
    )) {
        emitItemLocks(target, ctx.world.gameTime, ctx.playerPacketManager);
    }
    runResolvedEquipCommands(resolved, equipEventCtx(ctx).runCommand);
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
    const resolved =
        previous !== undefined && ctx
            ? resolveEquipEvents(
                  target,
                  ItemConfigs.get(previous).onUnequip,
                  ctx.world
              )
            : [];
    data[slot] = undefined;
    clearContextSource(target, SLOT_SOURCE[slot]);
    if (ctx?.playerPacketManager) syncFlags(target, ctx.playerPacketManager);

    if (ctx) commitEquipEvents(resolved, ctx);
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
    const unequipEvents =
        previous !== undefined && previous !== itemId && ctx
            ? resolveEquipEvents(
                  target,
                  ItemConfigs.get(previous).onUnequip,
                  ctx.world
              )
            : [];

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
        const equipEvents = resolveEquipEvents(
            target,
            config.onEquip,
            ctx.world
        );
        commitEquipEvents([...unequipEvents, ...equipEvents], ctx);
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
): boolean {
    const now = ctx?.world.gameTime ?? 0;
    const lockSlot = equipSlotToLockSlot(slot);
    // Same item → toggle unequip.
    if (data[slot] === itemId) {
        if (
            ctx &&
            isItemLocked(
                target,
                { action: "unequip", itemId, slot: lockSlot },
                now
            )
        )
            return false;
        clearSlot(target, data, slot, ctx);
        return true;
    }
    // Different item: must be able to unequip what's in the slot first.
    const current = data[slot];
    if (
        ctx &&
        current !== undefined &&
        isItemLocked(
            target,
            { action: "unequip", itemId: current, slot: lockSlot },
            now
        )
    ) {
        return false;
    }
    if (
        ctx &&
        isItemLocked(
            target,
            { action: "equip", itemId, slot: lockSlot },
            now
        )
    ) {
        return false;
    }
    setSlot(target, data, slot, itemId, ctx);
    return true;
}

/**
 * Starve-style equip: selecting an item toggles its equipment slot
 * (wear / main_hand / off_hand). Helmets stay on when switching weapons.
 */
export function selectEquipment(
    target: GameObject,
    itemId: number | undefined,
    ctx?: SelectEquipmentContext
): boolean {
    if (itemId === undefined) return true;

    const data = PlayerData.get(target);
    if (!data) return false;

    const config = ItemConfigs.get(itemId);
    if (!config.function) return true;

    switch (config.function) {
        case "wear":
            return toggleSlot(target, data, "helmet", itemId, ctx);
        case "main_hand":
            return toggleSlot(target, data, "mainHand", itemId, ctx);
        case "off_hand":
            return toggleSlot(target, data, "offHand", itemId, ctx);
        case "building":
            return toggleSlot(target, data, "mainHand", itemId, ctx);
        default:
            return true;
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
