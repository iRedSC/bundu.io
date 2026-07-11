import { Component } from "../engine";
import { amountForMode, MAX_STACK, type PlaceMode } from "@bundu/shared/inventory";

export type ItemStack = { id: number; count: number };

export type Inventory = {
    slots: (ItemStack | null)[];
    selected: number;
    cursor: ItemStack | null;
};

export const HOTBAR_SIZE = 10;

/** Outside-slot target for move/cursor actions. */
export const SLOT_OUTSIDE = -1;

export function emptySlots(count = HOTBAR_SIZE): (ItemStack | null)[] {
    return Array.from({ length: count }, () => null);
}

export const Inventory = Component.register<Inventory>(() => ({
    slots: emptySlots(),
    selected: 0,
    cursor: null,
}));

export function toPacketItems(
    inv: Inventory
): ([number, number] | null)[] {
    return inv.slots.map((stack) =>
        stack ? ([stack.id, stack.count] as [number, number]) : null
    );
}

export function toPacketCursor(
    inv: Inventory
): [number, number] | null {
    return inv.cursor
        ? [inv.cursor.id, inv.cursor.count]
        : null;
}

/**
 * Add items into existing stacks, then empty slots.
 * Returns how many could not fit.
 */
export function addItem(
    inv: Inventory,
    itemId: number,
    count: number
): number {
    let remaining = count;

    for (const stack of inv.slots) {
        if (!stack || stack.id !== itemId || remaining <= 0) continue;
        const space = MAX_STACK - stack.count;
        if (space <= 0) continue;
        const add = Math.min(space, remaining);
        stack.count += add;
        remaining -= add;
    }

    for (let i = 0; i < inv.slots.length && remaining > 0; i++) {
        if (inv.slots[i]) continue;
        const add = Math.min(MAX_STACK, remaining);
        inv.slots[i] = { id: itemId, count: add };
        remaining -= add;
    }

    return remaining;
}

/** Total count of `itemId` across all slots. */
export function countItem(inv: Inventory, itemId: number): number {
    let total = 0;
    for (const stack of inv.slots) {
        if (stack?.id === itemId) total += stack.count;
    }
    return total;
}

/** True when every entry in `requirements` is present in sufficient quantity. */
export function hasItems(
    inv: Inventory,
    requirements: Map<number, number> | Iterable<[number, number]>
): boolean {
    for (const [itemId, amount] of requirements) {
        if (countItem(inv, itemId) < amount) return false;
    }
    return true;
}

/**
 * Remove items across stacks. Returns false if inventory lacked enough
 * (inventory is left unchanged on failure).
 */
export function removeItem(
    inv: Inventory,
    itemId: number,
    count: number
): boolean {
    if (count <= 0) return true;
    if (countItem(inv, itemId) < count) return false;

    let remaining = count;
    for (let i = 0; i < inv.slots.length && remaining > 0; i++) {
        const stack = inv.slots[i];
        if (!stack || stack.id !== itemId) continue;
        const take = Math.min(stack.count, remaining);
        stack.count -= take;
        remaining -= take;
        if (stack.count <= 0) inv.slots[i] = null;
    }
    return true;
}

/**
 * Remove every requirement. Returns false without mutating if any are missing
 * (pre-checked via `hasItems`).
 */
export function removeItems(
    inv: Inventory,
    requirements: Map<number, number> | Iterable<[number, number]>
): boolean {
    const list = Array.from(requirements);
    if (!hasItems(inv, list)) return false;
    for (const [itemId, amount] of list) {
        removeItem(inv, itemId, amount);
    }
    return true;
}

function cloneSlots(slots: (ItemStack | null)[]): (ItemStack | null)[] {
    return slots.map((stack) =>
        stack ? { id: stack.id, count: stack.count } : null
    );
}

function restoreSlots(inv: Inventory, snapshot: (ItemStack | null)[]) {
    for (let i = 0; i < snapshot.length; i++) {
        const stack = snapshot[i];
        inv.slots[i] = stack ? { id: stack.id, count: stack.count } : null;
    }
}

/**
 * Atomically remove ingredients and add the product.
 * Restores slots and returns false if ingredients are missing or the product
 * cannot fully fit.
 */
export function tryConsumeAndAdd(
    inv: Inventory,
    requirements: Map<number, number> | Iterable<[number, number]>,
    productId: number,
    productAmount: number
): boolean {
    const list = Array.from(requirements);
    if (!hasItems(inv, list)) return false;

    const snapshot = cloneSlots(inv.slots);
    for (const [itemId, amount] of list) {
        removeItem(inv, itemId, amount);
    }
    if (addItem(inv, productId, productAmount) > 0) {
        restoreSlots(inv, snapshot);
        return false;
    }
    return true;
}

/** Dry-run of `tryConsumeAndAdd` — does not mutate `inv`. */
export function canConsumeAndAdd(
    inv: Inventory,
    requirements: Map<number, number> | Iterable<[number, number]>,
    productId: number,
    productAmount: number
): boolean {
    return tryConsumeAndAdd(
        {
            slots: cloneSlots(inv.slots),
            selected: inv.selected,
            cursor: inv.cursor,
        },
        requirements,
        productId,
        productAmount
    );
}

function validSlot(inv: Inventory, slot: number): boolean {
    return slot >= 0 && slot < inv.slots.length;
}

/** Drag move/swap between slots, or drop all when `to === SLOT_OUTSIDE`. */
export function moveSlot(
    inv: Inventory,
    from: number,
    to: number
): boolean {
    if (!validSlot(inv, from) || from === to) return false;
    const fromStack = inv.slots[from];
    if (!fromStack) return false;

    if (to === SLOT_OUTSIDE) {
        inv.slots[from] = null;
        return true;
    }
    if (!validSlot(inv, to)) return false;

    // Occupied → swap positions (same item included). Empty → move.
    const toStack = inv.slots[to] ?? null;
    inv.slots[from] = toStack;
    inv.slots[to] = fromStack;
    return true;
}

/**
 * Right-click cursor flow:
 * - empty cursor + slot → pick whole stack
 * - cursor + empty slot → place all/half/one
 * - cursor + same item → merge all/half/one (up to max stack)
 * - cursor + different item → swap
 * - slot === SLOT_OUTSIDE → drop from cursor by mode
 */
export function cursorSlot(
    inv: Inventory,
    slot: number,
    mode: PlaceMode
): boolean {
    if (slot === SLOT_OUTSIDE) {
        if (!inv.cursor) return false;
        const take = amountForMode(inv.cursor.count, mode);
        inv.cursor.count -= take;
        if (inv.cursor.count <= 0) inv.cursor = null;
        return true;
    }

    if (!validSlot(inv, slot)) return false;

    if (!inv.cursor) {
        const stack = inv.slots[slot];
        if (!stack) return false;
        inv.cursor = stack;
        inv.slots[slot] = null;
        return true;
    }

    const target = inv.slots[slot];
    if (!target) {
        const take = amountForMode(inv.cursor.count, mode);
        inv.slots[slot] = { id: inv.cursor.id, count: take };
        inv.cursor.count -= take;
        if (inv.cursor.count <= 0) inv.cursor = null;
        return true;
    }

    if (target.id === inv.cursor.id) {
        const want = amountForMode(inv.cursor.count, mode);
        const space = MAX_STACK - target.count;
        const add = Math.min(want, space, inv.cursor.count);
        if (add <= 0) return false;
        target.count += add;
        inv.cursor.count -= add;
        if (inv.cursor.count <= 0) inv.cursor = null;
        return true;
    }

    inv.slots[slot] = inv.cursor;
    inv.cursor = target;
    return true;
}
