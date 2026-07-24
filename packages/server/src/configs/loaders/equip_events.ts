import type { RegistryId } from "@bundu/shared/registry";
import type { GameRegistries } from "../registries.js";

export type LockItemAction = {
    /** Resolved item ids (from an id or `#tag`). */
    items: ReadonlySet<RegistryId<"item">>;
    allowUse: boolean;
    /** Lock duration in ms. `undefined` = until unlockItem. */
    forMs?: number;
};

export type UnlockItemAction = {
    items: ReadonlySet<RegistryId<"item">>;
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

function namespace(id: string): string {
    return id.slice(0, id.indexOf(":"));
}

function asObject(value: unknown): Record<string, unknown> | undefined {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return undefined;
    }
    return value as Record<string, unknown>;
}

function parseItemRef(
    raw: unknown,
    path: string,
    registries: GameRegistries,
    ownerId: string
): ReadonlySet<RegistryId<"item">> {
    if (typeof raw !== "string" || raw.length === 0) {
        throw new Error(`${path}: expected item id or #tag`);
    }
    return new Set(
        registries.item.resolveSet([raw], namespace(ownerId), path)
    );
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
        if (key !== "item" && key !== "allowUse" && key !== "for") {
            throw new Error(`${path}.${key}: unknown key`);
        }
    }
    const items = parseItemRef(obj.item, `${path}.item`, registries, ownerId);
    if (items.size === 0) {
        throw new Error(`${path}.item: resolved to no items`);
    }
    let allowUse = false;
    if (obj.allowUse !== undefined) {
        if (typeof obj.allowUse !== "boolean") {
            throw new Error(`${path}.allowUse: expected boolean`);
        }
        allowUse = obj.allowUse;
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
    return { items, allowUse, forMs };
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
        if (key !== "item") {
            throw new Error(`${path}.${key}: unknown key`);
        }
    }
    const items = parseItemRef(obj.item, `${path}.item`, registries, ownerId);
    if (items.size === 0) {
        throw new Error(`${path}.item: resolved to no items`);
    }
    return { items };
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
 *     item: #bundu:swords
 *     allowUse: true
 *     for: 5000
 *   unlockItem:
 *     item: bundu:wood_sword
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
