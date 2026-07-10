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

/** Total count of an item across slots + cursor. */
export function countOf(inv: Inventory, itemId: number): number {
    let n = 0;
    for (const stack of inv.slots) {
        if (stack?.id === itemId) n += stack.count;
    }
    if (inv.cursor?.id === itemId) n += inv.cursor.count;
    return n;
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

/** Remove up to `count` from a slot. Clears the slot when empty. */
export function removeFromSlot(
    inv: Inventory,
    slot: number,
    count: number
): number {
    const stack = inv.slots[slot];
    if (!stack || count <= 0) return 0;

    const removed = Math.min(stack.count, count);
    stack.count -= removed;
    if (stack.count <= 0) inv.slots[slot] = null;
    return removed;
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
