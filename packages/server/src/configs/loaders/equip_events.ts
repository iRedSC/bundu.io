import type { RegistryId } from "@bundu/shared/registry";
import {
    isLockAction,
    isLockSlot,
    lockActionsToFlags,
    lockSlotsToFlags,
    LOCK_SLOTS_ALL,
    type LockAction,
    type LockSlot,
} from "@bundu/shared/item_lock";
import type { GameRegistries } from "../registries.js";

export type LockItemAction = {
    /**
     * Resolved item ids (from ids / `#tag`s).
     * `null` = any item (slot-only lock).
     */
    items: ReadonlySet<RegistryId<"item">> | null;
    /** Restricted actions for these items/slots. */
    lock: readonly LockAction[];
    /** Bitmask of {@link lock} for wire / runtime checks. */
    flags: number;
    /**
     * Equipment slots this lock applies to.
     * When `slots` is omitted in YAML, all slots (`LOCK_SLOTS_ALL`).
     */
    slots: readonly LockSlot[];
    /** Bitmask of {@link slots}. */
    slotFlags: number;
    /** Lock duration in ms. `undefined` = until unlockItem. */
    forMs?: number;
};

export type UnlockItemAction = {
    /** `null` = any item (clear by slots only). */
    items: ReadonlySet<RegistryId<"item">> | null;
    /** When set, only clear locks that overlap these slots. */
    slots?: readonly LockSlot[];
    slotFlags?: number;
};

/** One-shot actions fired on equip / unequip. */
export type EquipEvents = {
    commands: readonly string[];
    lockItems: readonly LockItemAction[];
    unlockItems: readonly UnlockItemAction[];
};

const EMPTY_EVENTS: EquipEvents = {
    commands: [],
    lockItems: [],
    unlockItems: [],
};

const ALL_SLOTS: readonly LockSlot[] = ["mainhand", "offhand", "helmet"];

function namespace(id: string): string {
    return id.slice(0, id.indexOf(":"));
}

function asObject(value: unknown): Record<string, unknown> | undefined {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return undefined;
    }
    return value as Record<string, unknown>;
}

function parseItems(
    raw: unknown,
    path: string,
    registries: GameRegistries,
    ownerId: string
): ReadonlySet<RegistryId<"item">> {
    if (!Array.isArray(raw) || raw.length === 0) {
        throw new Error(`${path}: expected non-empty string[] of item ids/#tags`);
    }
    if (raw.some((entry) => typeof entry !== "string" || entry.length === 0)) {
        throw new Error(`${path}: expected non-empty string[] of item ids/#tags`);
    }
    const ids = registries.item.resolveSet(
        raw as string[],
        namespace(ownerId),
        path
    );
    if (ids.length === 0) {
        throw new Error(`${path}: resolved to no items`);
    }
    return new Set(ids);
}

function parseLockActions(raw: unknown, path: string): LockAction[] {
    if (!Array.isArray(raw) || raw.length === 0) {
        throw new Error(
            `${path}: expected non-empty array of equip|unequip|use|drop|craft`
        );
    }
    const seen = new Set<LockAction>();
    const actions: LockAction[] = [];
    for (const [i, entry] of raw.entries()) {
        if (typeof entry !== "string" || !isLockAction(entry)) {
            throw new Error(
                `${path}[${i}]: expected equip|unequip|use|drop|craft`
            );
        }
        if (!seen.has(entry)) {
            seen.add(entry);
            actions.push(entry);
        }
    }
    return actions;
}

function parseSlots(raw: unknown, path: string): LockSlot[] {
    if (!Array.isArray(raw) || raw.length === 0) {
        throw new Error(
            `${path}: expected non-empty array of mainhand|offhand|helmet`
        );
    }
    const seen = new Set<LockSlot>();
    const slots: LockSlot[] = [];
    for (const [i, entry] of raw.entries()) {
        if (typeof entry !== "string" || !isLockSlot(entry)) {
            throw new Error(
                `${path}[${i}]: expected mainhand|offhand|helmet`
            );
        }
        if (!seen.has(entry)) {
            seen.add(entry);
            slots.push(entry);
        }
    }
    return slots;
}

/** Require `items` and/or `slots` — never neither. Reject legacy `item:`. */
function requireItemsOrSlots(
    obj: Record<string, unknown>,
    path: string
): { hasItems: boolean; hasSlots: boolean } {
    if (obj.item !== undefined) {
        throw new Error(`${path}.item: renamed to items (string[])`);
    }
    const hasItems = obj.items !== undefined;
    const hasSlots = obj.slots !== undefined;
    if (!hasItems && !hasSlots) {
        throw new Error(`${path}: expected items and/or slots`);
    }
    return { hasItems, hasSlots };
}

function parseLockItem(
    raw: unknown,
    path: string,
    registries: GameRegistries,
    ownerId: string
): LockItemAction {
    const obj = asObject(raw);
    if (!obj) throw new Error(`${path}: expected object`);
    for (const key of Object.keys(obj)) {
        if (
            key !== "items" &&
            key !== "slots" &&
            key !== "lock" &&
            key !== "for"
        ) {
            throw new Error(`${path}.${key}: unknown key`);
        }
    }
    const { hasItems, hasSlots } = requireItemsOrSlots(obj, path);
    const items = hasItems
        ? parseItems(obj.items, `${path}.items`, registries, ownerId)
        : null;
    const slots = hasSlots
        ? parseSlots(obj.slots, `${path}.slots`)
        : [...ALL_SLOTS];
    const lock = parseLockActions(obj.lock, `${path}.lock`);
    let forMs: number | undefined;
    if (obj.for !== undefined) {
        if (
            typeof obj.for !== "number" ||
            !Number.isFinite(obj.for) ||
            obj.for < 0
        ) {
            throw new Error(`${path}.for: expected non-negative number (ms)`);
        }
        forMs = obj.for;
    }
    return {
        items,
        lock,
        flags: lockActionsToFlags(lock),
        slots,
        slotFlags: hasSlots ? lockSlotsToFlags(slots) : LOCK_SLOTS_ALL,
        forMs,
    };
}

function parseUnlockItem(
    raw: unknown,
    path: string,
    registries: GameRegistries,
    ownerId: string
): UnlockItemAction {
    const obj = asObject(raw);
    if (!obj) throw new Error(`${path}: expected object`);
    for (const key of Object.keys(obj)) {
        if (key !== "items" && key !== "slots") {
            throw new Error(`${path}.${key}: unknown key`);
        }
    }
    const { hasItems, hasSlots } = requireItemsOrSlots(obj, path);
    const items = hasItems
        ? parseItems(obj.items, `${path}.items`, registries, ownerId)
        : null;
    if (!hasSlots) {
        return { items };
    }
    const slots = parseSlots(obj.slots, `${path}.slots`);
    return { items, slots, slotFlags: lockSlotsToFlags(slots) };
}

function parseLockItems(
    raw: unknown,
    path: string,
    registries: GameRegistries,
    ownerId: string
): LockItemAction[] {
    if (raw === undefined) return [];
    if (Array.isArray(raw)) {
        return raw.map((entry, i) =>
            parseLockItem(entry, `${path}[${i}]`, registries, ownerId)
        );
    }
    return [parseLockItem(raw, path, registries, ownerId)];
}

function parseUnlockItems(
    raw: unknown,
    path: string,
    registries: GameRegistries,
    ownerId: string
): UnlockItemAction[] {
    if (raw === undefined) return [];
    if (Array.isArray(raw)) {
        return raw.map((entry, i) =>
            parseUnlockItem(entry, `${path}[${i}]`, registries, ownerId)
        );
    }
    return [parseUnlockItem(raw, path, registries, ownerId)];
}

function parseCommands(raw: unknown, path: string): string[] {
    if (raw === undefined) return [];
    if (!Array.isArray(raw) || raw.some((entry) => typeof entry !== "string")) {
        throw new Error(`${path}: expected string[]`);
    }
    return (raw as string[]).map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) throw new Error(`${path}[${i}]: empty command`);
        return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
    });
}

/**
 * Parse an onEquip / onUnequip block:
 * ```
 * onEquip:
 *   commands:
 *     - "give @s bundu:iridium 1"
 *   lockItem:
 *     items: [#bundu:swords]          # and/or slots (not neither)
 *     slots: [mainhand, offhand, helmet]
 *     lock: [equip, unequip, use, drop, craft]
 *     for: 5000
 *   unlockItem:
 *     items: [bundu:wood_sword]
 * ```
 */
export function parseEquipEvents(
    raw: unknown,
    path: string,
    registries: GameRegistries,
    ownerId: string
): EquipEvents | undefined {
    if (raw === undefined) return undefined;
    const obj = asObject(raw);
    if (!obj) throw new Error(`${path}: expected object`);
    for (const key of Object.keys(obj)) {
        if (key !== "commands" && key !== "lockItem" && key !== "unlockItem") {
            throw new Error(`${path}.${key}: unknown key`);
        }
    }
    const events: EquipEvents = {
        commands: parseCommands(obj.commands, `${path}.commands`),
        lockItems: parseLockItems(
            obj.lockItem,
            `${path}.lockItem`,
            registries,
            ownerId
        ),
        unlockItems: parseUnlockItems(
            obj.unlockItem,
            `${path}.unlockItem`,
            registries,
            ownerId
        ),
    };
    if (
        events.commands.length === 0 &&
        events.lockItems.length === 0 &&
        events.unlockItems.length === 0
    ) {
        return undefined;
    }
    return events;
}

/** Prefer override; fall back to base when override is absent. */
export function mergeEquipEvents(
    base: unknown,
    override: unknown,
    path: string,
    registries: GameRegistries,
    ownerId: string
): EquipEvents | undefined {
    if (override !== undefined) {
        return parseEquipEvents(override, path, registries, ownerId);
    }
    if (base !== undefined) {
        return parseEquipEvents(base, path, registries, ownerId);
    }
    return undefined;
}

export function emptyEquipEvents(): EquipEvents {
    return EMPTY_EVENTS;
}

export function equipEventsAreEmpty(
    events: EquipEvents | undefined
): boolean {
    if (!events) return true;
    return (
        events.commands.length === 0 &&
        events.lockItems.length === 0 &&
        events.unlockItems.length === 0
    );
}

export { LOCK_SLOTS_ALL };
