import {
    LOCK_ANY_ITEM,
    lockActionsToFlags,
    lockSlotsToFlags,
} from "@bundu/shared/item_lock";
import { ServerPacket } from "@bundu/shared/packet_definitions.js";
import type { GameObject, ServerContext, World } from "../engine";
import { PlayerData } from "../components/player.js";
import {
    isEquippedLockAction,
    ItemLocks,
    type ItemLockRequest,
    type ItemLockRule,
} from "../components/item_locks.js";
import type {
    EquipEvents,
    EquipEventTarget,
    LockItemAction,
    UnlockItemAction,
} from "../configs/loaders/equip_events.js";
import { subjectMatchesTarget } from "../systems/effect_targets.js";

export function clearPlayerItemLocks(player: GameObject): void {
    const state = ItemLocks.get(player);
    if (state.rules.size === 0) return;
    state.rules.clear();
    state.revision++;
}

export function findLock(
    player: GameObject,
    request: ItemLockRequest,
    now: number
): ItemLockRule | undefined {
    for (const rule of ItemLocks.get(player).rules.values()) {
        if (rule.endsAt <= now) continue;
        if (rule.action !== request.action) continue;
        if (rule.itemId !== null && rule.itemId !== request.itemId) continue;
        if (
            "slot" in rule &&
            "slot" in request &&
            rule.slot !== request.slot
        ) {
            continue;
        }
        return rule;
    }
    return undefined;
}

export function isItemLocked(
    player: GameObject,
    request: ItemLockRequest | undefined,
    now: number
): boolean {
    return request !== undefined && findLock(player, request, now) !== undefined;
}

function ruleKey(rule: ItemLockRule): string {
    return [
        rule.source,
        rule.action,
        rule.itemId ?? "*",
        "slot" in rule ? rule.slot : "",
    ].join("|");
}

export function applyLockItem(
    player: GameObject,
    action: LockItemAction,
    now: number
): boolean {
    const state = ItemLocks.get(player);
    const durationMs = action.forMs ?? 0;
    const endsAt =
        action.forMs === undefined ? Number.POSITIVE_INFINITY : now + action.forMs;
    const itemIds = action.items ? [...action.items] : [null];
    for (const itemId of itemIds) {
        for (const lockAction of action.lock) {
            if (isEquippedLockAction(lockAction)) {
                for (const slot of action.slots) {
                    const rule: ItemLockRule = {
                        source: action.source,
                        action: lockAction,
                        itemId,
                        slot,
                        endsAt,
                        durationMs,
                    };
                    state.rules.set(ruleKey(rule), rule);
                }
            } else {
                if (itemId === null) continue;
                const rule: ItemLockRule = {
                    source: action.source,
                    action: lockAction,
                    itemId,
                    endsAt,
                    durationMs,
                };
                state.rules.set(ruleKey(rule), rule);
            }
        }
    }
    state.revision++;
    return true;
}

export function applyUnlockItem(
    player: GameObject,
    action: UnlockItemAction
): boolean {
    const state = ItemLocks.get(player);
    let changed = false;
    for (const [key, rule] of state.rules) {
        if (action.source !== undefined) {
            if (rule.source === action.source) {
                state.rules.delete(key);
                changed = true;
            }
            continue;
        }
        const itemMatches =
            action.items === null ||
            (rule.itemId !== null && action.items.has(rule.itemId));
        const slotMatches =
            action.slotFlags === undefined ||
            ("slot" in rule &&
                (lockSlotsToFlags([rule.slot]) & action.slotFlags) !== 0);
        if (itemMatches && slotMatches) {
            state.rules.delete(key);
            changed = true;
        }
    }
    if (changed) state.revision++;
    return changed;
}

/** Drop expired locks. Returns true if anything changed. */
export function pruneExpiredLocks(player: GameObject, now: number): boolean {
    const state = ItemLocks.get(player);
    let changed = false;
    for (const [key, rule] of state.rules) {
        if (rule.endsAt > now) continue;
        state.rules.delete(key);
        changed = true;
    }
    if (changed) state.revision++;
    return changed;
}

export function emitItemLocks(
    player: GameObject,
    now: number,
    playerPacketManager: ServerContext["playerPacketManager"]
): void {
    pruneExpiredLocks(player, now);
    const locks: ServerPacket.UpdateItemLocks["locks"] = [];
    for (const rule of ItemLocks.get(player).rules.values()) {
        const remainingMs =
            rule.endsAt === Number.POSITIVE_INFINITY
                ? -1
                : Math.max(0, Math.ceil(rule.endsAt - now));
        locks.push([
            rule.itemId ?? LOCK_ANY_ITEM,
            remainingMs,
            rule.durationMs,
            lockActionsToFlags([rule.action]),
            "slot" in rule ? lockSlotsToFlags([rule.slot]) : 0,
        ]);
    }
    playerPacketManager.set(player.id, ServerPacket.UpdateItemLocks, { locks });
}

export type EquipEventContext = {
    world: World;
    now: number;
    runCommand: (target: GameObject, commandLine: string) => void;
};

export type ResolvedEquipEvent = {
    target: GameObject,
    events: EquipEventTarget,
};

function applyTargetEvents(
    { target, events }: ResolvedEquipEvent,
    now: number
): boolean {
    let locksChanged = false;
    if (PlayerData.get(target)) {
        for (const action of events.lockItems) {
            if (applyLockItem(target, action, now)) locksChanged = true;
        }
        for (const action of events.unlockItems) {
            if (applyUnlockItem(target, action)) locksChanged = true;
        }
    }
    return locksChanged;
}

/** Resolve targets against one stable world snapshot without mutating state. */
export function resolveEquipEvents(
    executor: GameObject,
    events: EquipEvents | undefined,
    world: World
): ResolvedEquipEvent[] {
    if (!events) return [];
    const resolved: ResolvedEquipEvent[] = [];
    const worldCandidates = [...world.objects.values()];
    for (const event of events.targets) {
        const candidates =
            event.base === "s" ? [executor] : worldCandidates;
        for (const target of candidates) {
            if (
                !subjectMatchesTarget(target, event, {
                    world,
                    executor,
                })
            ) {
                continue;
            }
            resolved.push({ target, events: event });
        }
    }
    return resolved;
}

/** Apply declarative lock changes after the equipment state commits. */
export function applyResolvedEquipEvents(
    resolved: readonly ResolvedEquipEvent[],
    now: number
): GameObject[] {
    const changed = new Map<number, GameObject>();
    for (const event of resolved) {
        if (applyTargetEvents(event, now)) {
            changed.set(event.target.id, event.target);
        }
    }
    return [...changed.values()];
}

/** Run commands only after the complete equipment transaction commits. */
export function runResolvedEquipCommands(
    resolved: readonly ResolvedEquipEvent[],
    runCommand: EquipEventContext["runCommand"]
): void {
    for (const { target, events } of resolved) {
        for (const line of events.commands) {
            runCommand(target, line);
        }
    }
}

/** True if any recipe ingredient has an active `craft` lock. */
export function inventoryHasLockedIngredient(
    player: GameObject,
    ingredients: ReadonlyMap<number, number>,
    now: number
): boolean {
    for (const itemId of ingredients.keys()) {
        if (
            isItemLocked(
                player,
                { action: "craft", itemId: Number(itemId) },
                now
            )
        ) {
            return true;
        }
    }
    return false;
}
