import {
    LOCK_ANY_ITEM,
    LOCK_SLOTS_ALL,
    lockFlagsHas,
    lockSlotFlagsHas,
    type LockAction,
    type LockSlot,
} from "@bundu/shared/item_lock";
import { ServerPacket } from "@bundu/shared/packet_definitions.js";
import type { GameObject, ServerContext, World } from "../engine";
import { PlayerData } from "../components/player.js";
import type {
    EquipEvents,
    LockItemAction,
    UnlockItemAction,
} from "../configs/loaders/equip_events.js";

export type ItemLockRule = {
    /** `null` = any item (slot-only). */
    items: Set<number> | null;
    /** Absolute gameTime when the lock expires. `Infinity` = until unlockItem. */
    endsAt: number;
    /** Authored duration in ms (0 when permanent). Used for wipe progress. */
    durationMs: number;
    /** Bitmask of restricted {@link LockAction}s. */
    flags: number;
    /** Bitmask of equipment slots this lock applies to. */
    slotFlags: number;
};

/** Per-player lock rules (item filter and/or slot filter). */
const locksByPlayer = new Map<number, ItemLockRule[]>();

function rulesOf(player: GameObject): ItemLockRule[] {
    let rules = locksByPlayer.get(player.id);
    if (!rules) {
        rules = [];
        locksByPlayer.set(player.id, rules);
    }
    return rules;
}

export function clearPlayerItemLocks(playerId: number): void {
    locksByPlayer.delete(playerId);
}

function isEquippedInSlots(
    player: GameObject,
    itemId: number,
    slotFlags: number
): boolean {
    const data = PlayerData.get(player);
    if (!data) return false;
    if (lockSlotFlagsHas(slotFlags, "mainhand") && data.mainHand === itemId) {
        return true;
    }
    if (lockSlotFlagsHas(slotFlags, "offhand") && data.offHand === itemId) {
        return true;
    }
    if (lockSlotFlagsHas(slotFlags, "helmet") && data.helmet === itemId) {
        return true;
    }
    return false;
}

/**
 * Whether a rule applies to `itemId` (+ optional equipment `slot`).
 *
 * - **items** filter (when set): item must be in the set
 * - **slots** filter: when `slot` is provided, it must be included; when omitted
 *   (drop/craft), item-only locks (`slotFlags === ALL`) match by item; otherwise
 *   the item must currently be equipped in one of the rule's slots
 */
function ruleMatches(
    player: GameObject,
    rule: ItemLockRule,
    itemId: number,
    slot?: LockSlot
): boolean {
    if (rule.items && !rule.items.has(itemId)) return false;
    if (slot !== undefined) {
        return lockSlotFlagsHas(rule.slotFlags, slot);
    }
    // No slot context (drop / craft).
    if (rule.slotFlags === LOCK_SLOTS_ALL && rule.items) return true;
    return isEquippedInSlots(player, itemId, rule.slotFlags);
}

export function findLock(
    player: GameObject,
    itemId: number,
    action: LockAction,
    now: number,
    slot?: LockSlot
): ItemLockRule | undefined {
    const rules = locksByPlayer.get(player.id);
    if (!rules) return undefined;
    for (const rule of rules) {
        if (rule.endsAt <= now) continue;
        if (!lockFlagsHas(rule.flags, action)) continue;
        if (ruleMatches(player, rule, itemId, slot)) return rule;
    }
    return undefined;
}

/**
 * @param slot - when set (equip/unequip/use), the lock must include this slot.
 *   Omitted for drop/craft (see {@link ruleMatches}).
 */
export function isActionLocked(
    player: GameObject,
    itemId: number | undefined,
    action: LockAction,
    now: number,
    slot?: LockSlot
): boolean {
    if (itemId === undefined) return false;
    return findLock(player, itemId, action, now, slot) !== undefined;
}

function sameItemSet(
    a: Set<number> | null,
    b: ReadonlySet<number> | null
): boolean {
    if (a === null && b === null) return true;
    if (a === null || b === null || a.size !== b.size) return false;
    for (const id of a) {
        if (!b.has(id)) return false;
    }
    return true;
}

/**
 * Apply a lock rule. Same item-set + slotFlags coalesces into one rule:
 * flags OR together, timer keeps the later expiry.
 */
export function applyLockItem(
    player: GameObject,
    action: LockItemAction,
    now: number
): boolean {
    const rules = rulesOf(player);
    const durationMs = action.forMs ?? 0;
    const endsAt =
        action.forMs === undefined ? Number.POSITIVE_INFINITY : now + action.forMs;
    for (const rule of rules) {
        if (
            rule.slotFlags !== action.slotFlags ||
            !sameItemSet(rule.items, action.items)
        ) {
            continue;
        }
        rule.flags |= action.flags;
        if (endsAt > rule.endsAt) {
            rule.endsAt = endsAt;
            rule.durationMs = durationMs;
        }
        return true;
    }
    rules.push({
        items: action.items ? new Set(action.items) : null,
        endsAt,
        durationMs,
        flags: action.flags,
        slotFlags: action.slotFlags,
    });
    return true;
}

export function applyUnlockItem(
    player: GameObject,
    action: UnlockItemAction
): boolean {
    const rules = locksByPlayer.get(player.id);
    if (!rules) return false;
    let changed = false;
    const next: ItemLockRule[] = [];
    for (const rule of rules) {
        if (
            action.slotFlags !== undefined &&
            (rule.slotFlags & action.slotFlags) === 0
        ) {
            next.push(rule);
            continue;
        }

        if (action.items) {
            // Item unlock does not clear slot-only rules.
            if (!rule.items) {
                next.push(rule);
                continue;
            }
            let removed = false;
            for (const id of action.items) {
                if (rule.items.delete(id)) removed = true;
            }
            if (removed) changed = true;
            if (rule.items.size > 0) next.push(rule);
            else changed = true;
            continue;
        }

        // Slots-only unlock: clear overlapping slot bits from every rule.
        if (action.slotFlags !== undefined) {
            const cleared = rule.slotFlags & ~action.slotFlags;
            if (cleared === rule.slotFlags) {
                next.push(rule);
                continue;
            }
            changed = true;
            if (cleared !== 0) {
                next.push({ ...rule, slotFlags: cleared });
            }
            continue;
        }

        next.push(rule);
    }
    if (next.length === 0) locksByPlayer.delete(player.id);
    else locksByPlayer.set(player.id, next);
    return changed;
}

/** Drop expired locks. Returns true if anything changed. */
export function pruneExpiredLocks(player: GameObject, now: number): boolean {
    const rules = locksByPlayer.get(player.id);
    if (!rules) return false;
    const next = rules.filter((rule) => rule.endsAt > now);
    if (next.length === rules.length) return false;
    if (next.length === 0) locksByPlayer.delete(player.id);
    else locksByPlayer.set(player.id, next);
    return true;
}

export function emitItemLocks(
    player: GameObject,
    now: number,
    playerPacketManager: ServerContext["playerPacketManager"]
): void {
    pruneExpiredLocks(player, now);
    const rules = locksByPlayer.get(player.id);
    const locks: ServerPacket.UpdateItemLocks["locks"] = [];
    if (rules) {
        for (const rule of rules) {
            const remainingMs =
                rule.endsAt === Number.POSITIVE_INFINITY
                    ? -1
                    : Math.max(0, Math.ceil(rule.endsAt - now));
            if (rule.items) {
                for (const itemId of rule.items) {
                    locks.push([
                        itemId,
                        remainingMs,
                        rule.durationMs,
                        rule.flags,
                        rule.slotFlags,
                    ]);
                }
            } else {
                locks.push([
                    LOCK_ANY_ITEM,
                    remainingMs,
                    rule.durationMs,
                    rule.flags,
                    rule.slotFlags,
                ]);
            }
        }
    }
    playerPacketManager.set(player.id, ServerPacket.UpdateItemLocks, { locks });
}

export type EquipEventContext = {
    world: World;
    now: number;
    runCommand: (commandLine: string) => void;
};

/** Run onEquip / onUnequip once. Returns whether locks changed. */
export function runEquipEvents(
    player: GameObject,
    events: EquipEvents | undefined,
    ctx: EquipEventContext
): boolean {
    if (!events) return false;
    let locksChanged = false;
    for (const line of events.commands) {
        ctx.runCommand(line);
    }
    for (const action of events.lockItems) {
        if (applyLockItem(player, action, ctx.now)) locksChanged = true;
    }
    for (const action of events.unlockItems) {
        if (applyUnlockItem(player, action)) locksChanged = true;
    }
    return locksChanged;
}

/** True if any ingredient has an active `craft` lock. */
export function inventoryHasLockedIngredient(
    player: GameObject,
    ingredients: ReadonlyMap<number, number>,
    now: number
): boolean {
    if (ingredients.size === 0) return false;
    for (const itemId of ingredients.keys()) {
        if (isActionLocked(player, itemId, "craft", now)) return true;
    }
    return false;
}
