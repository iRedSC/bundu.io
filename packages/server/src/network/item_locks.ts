import { ServerPacket } from "@bundu/shared/packet_definitions.js";
import {
    lockFlagsHas,
    type LockAction,
} from "@bundu/shared/item_lock";
import type { GameObject, ServerContext, World } from "../engine";
import type {
    EquipEvents,
    LockItemAction,
    UnlockItemAction,
} from "../configs/loaders/equip_events.js";

export type ItemLockState = {
    /** Absolute gameTime when the lock expires. `Infinity` = until unlockItem. */
    endsAt: number;
    /** Authored duration in ms (0 when permanent). Used for wipe progress. */
    durationMs: number;
    /** Bitmask of restricted {@link LockAction}s. */
    flags: number;
};

/** Per-player item locks keyed by item registry id. */
const locksByPlayer = new Map<number, Map<number, ItemLockState>>();

function lockMap(player: GameObject): Map<number, ItemLockState> {
    let map = locksByPlayer.get(player.id);
    if (!map) {
        map = new Map();
        locksByPlayer.set(player.id, map);
    }
    return map;
}

export function clearPlayerItemLocks(playerId: number): void {
    locksByPlayer.delete(playerId);
}

export function getItemLock(
    player: GameObject,
    itemId: number,
    now: number
): ItemLockState | undefined {
    const map = locksByPlayer.get(player.id);
    if (!map) return undefined;
    const lock = map.get(itemId);
    if (!lock) return undefined;
    if (lock.endsAt <= now) {
        map.delete(itemId);
        if (map.size === 0) locksByPlayer.delete(player.id);
        return undefined;
    }
    return lock;
}

export function isActionLocked(
    player: GameObject,
    itemId: number | undefined,
    action: LockAction,
    now: number
): boolean {
    if (itemId === undefined) return false;
    const lock = getItemLock(player, itemId, now);
    return lock !== undefined && lockFlagsHas(lock.flags, action);
}

export function applyLockItem(
    player: GameObject,
    action: LockItemAction,
    now: number
): boolean {
    const map = lockMap(player);
    let changed = false;
    const durationMs = action.forMs ?? 0;
    const endsAt =
        action.forMs === undefined ? Number.POSITIVE_INFINITY : now + action.forMs;
    for (const itemId of action.items) {
        map.set(itemId, {
            endsAt,
            durationMs,
            flags: action.flags,
        });
        changed = true;
    }
    return changed;
}

export function applyUnlockItem(
    player: GameObject,
    action: UnlockItemAction
): boolean {
    const map = locksByPlayer.get(player.id);
    if (!map) return false;
    let changed = false;
    for (const itemId of action.items) {
        if (map.delete(itemId)) changed = true;
    }
    if (map.size === 0) locksByPlayer.delete(player.id);
    return changed;
}

/** Drop expired locks. Returns true if anything changed. */
export function pruneExpiredLocks(player: GameObject, now: number): boolean {
    const map = locksByPlayer.get(player.id);
    if (!map) return false;
    let changed = false;
    for (const [itemId, lock] of map) {
        if (lock.endsAt <= now) {
            map.delete(itemId);
            changed = true;
        }
    }
    if (map.size === 0) locksByPlayer.delete(player.id);
    return changed;
}

export function emitItemLocks(
    player: GameObject,
    now: number,
    playerPacketManager: ServerContext["playerPacketManager"]
): void {
    pruneExpiredLocks(player, now);
    const map = locksByPlayer.get(player.id);
    const locks: ServerPacket.UpdateItemLocks["locks"] = [];
    if (map) {
        for (const [itemId, lock] of map) {
            const remainingMs =
                lock.endsAt === Number.POSITIVE_INFINITY
                    ? -1
                    : Math.max(0, Math.ceil(lock.endsAt - now));
            locks.push([itemId, remainingMs, lock.durationMs, lock.flags]);
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
