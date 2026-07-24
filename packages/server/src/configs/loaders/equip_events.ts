import type { RegistryId } from "@bundu/shared/registry";
import {
    isLockAction,
    isLockSlot,
    type LockAction,
    type LockSlot,
} from "@bundu/shared/item_lock";
import type { GameRegistries } from "../registries.js";
import {
    parseEffectTargetMatch,
    type EffectTargetMatch,
} from "./effect_context.js";

export type LockItemAction = {
    /** Stable authored location used to refresh this lock without duplication. */
    source: string;
    /**
     * Resolved item ids (from ids / `#tag`s).
     * `null` = any item (slot-only lock).
     */
    items: ReadonlySet<RegistryId<"item">> | null;
    /** Restricted actions for these items/slots. */
    lock: readonly LockAction[];
    /**
     * Equipment slots this lock applies to.
     * When `slots` is omitted in YAML, all equipment slots.
     */
    slots: readonly LockSlot[];
    /** Lock duration in ms. `undefined` = until unlockItem. */
    forMs?: number;
};

export type UnlockItemAction = {
    /** When set, remove only rules created by this authored lock id. */
    source?: string;
    /** `null` = any item (clear by slots only). */
    items: ReadonlySet<RegistryId<"item">> | null;
    /** When set, only clear locks that overlap these slots. */
    slots?: readonly LockSlot[];
};

export type EquipEventTarget = EffectTargetMatch & {
    lockItems: readonly LockItemAction[];
    unlockItems: readonly UnlockItemAction[];
};

/** One-shot actions fired on equip / unequip, grouped by target selector. */
export type EquipEvents = {
    targets: readonly EquipEventTarget[];
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

function parseLockSource(
    raw: unknown,
    path: string,
    ownerId: string
): string | undefined {
    if (raw === undefined) return undefined;
    if (typeof raw !== "string" || raw.trim().length === 0) {
        throw new Error(`${path}: expected non-empty string`);
    }
    return `${ownerId}:${raw.trim()}`;
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
            key !== "for" &&
            key !== "id"
        ) {
            throw new Error(`${path}.${key}: unknown key`);
        }
    }
    const { hasItems, hasSlots } = requireItemsOrSlots(obj, path);
    const source = parseLockSource(obj.id, `${path}.id`, ownerId) ?? path;
    const items = hasItems
        ? parseItems(obj.items, `${path}.items`, registries, ownerId)
        : null;
    const slots = hasSlots
        ? parseSlots(obj.slots, `${path}.slots`)
        : [...ALL_SLOTS];
    const lock = parseLockActions(obj.lock, `${path}.lock`);
    if (
        items === null &&
        lock.some((action) => action === "drop" || action === "craft")
    ) {
        throw new Error(
            `${path}.items: required when locking drop or craft`
        );
    }
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
        source,
        items,
        lock,
        slots,
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
        if (key !== "items" && key !== "slots" && key !== "id") {
            throw new Error(`${path}.${key}: unknown key`);
        }
    }
    const source = parseLockSource(obj.id, `${path}.id`, ownerId);
    if (source && obj.items === undefined && obj.slots === undefined) {
        return { source, items: null };
    }
    const { hasItems, hasSlots } = requireItemsOrSlots(obj, path);
    const items = hasItems
        ? parseItems(obj.items, `${path}.items`, registries, ownerId)
        : null;
    if (!hasSlots) {
        return { source, items };
    }
    const slots = parseSlots(obj.slots, `${path}.slots`);
    return { source, items, slots };
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

/**
 * Parse an onEquip / onUnequip block:
 * ```
 * onEquip:
 *   "@s":
 *     lockItem:
 *       items: ["#bundu:swords"]      # and/or slots (not neither)
 *       slots: [mainhand, offhand, helmet]
 *       lock: [equip, unequip, use, drop, craft]
 *       for: 5000
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
    const targets: EquipEventTarget[] = [];
    for (const [selector, rawEvents] of Object.entries(obj)) {
        const targetPath = `${path}.${selector}`;
        const eventObj = asObject(rawEvents);
        if (!eventObj) throw new Error(`${targetPath}: expected object`);
        for (const key of Object.keys(eventObj)) {
            if (key !== "lockItem" && key !== "unlockItem") {
                throw new Error(`${targetPath}.${key}: unknown key`);
            }
        }
        const target: EquipEventTarget = {
            ...parseEffectTargetMatch(
                selector,
                targetPath,
                registries,
                ownerId
            ),
            lockItems: parseLockItems(
                eventObj.lockItem,
                `${targetPath}.lockItem`,
                registries,
                ownerId
            ),
            unlockItems: parseUnlockItems(
                eventObj.unlockItem,
                `${targetPath}.unlockItem`,
                registries,
                ownerId
            ),
        };
        if (
            target.lockItems.length > 0 ||
            target.unlockItems.length > 0
        ) {
            targets.push(target);
        }
    }
    return targets.length > 0 ? { targets } : undefined;
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
