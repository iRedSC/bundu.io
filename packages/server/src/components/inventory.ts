import { Component } from "../engine";

export type ItemStack = { id: number; count: number };

export type Inventory = {
    slots: (ItemStack | null)[];
    selected: number;
};

export const HOTBAR_SIZE = 10;
export const MAX_STACK = 64;

export function emptySlots(count = HOTBAR_SIZE): (ItemStack | null)[] {
    return Array.from({ length: count }, () => null);
}

export const Inventory = Component.register<Inventory>(() => ({
    slots: emptySlots(),
    selected: 0,
}));

/** Packet shape for UpdateInventory. */
export function toPacketItems(
    inv: Inventory
): ([number, number] | null)[] {
    return inv.slots.map((stack) =>
        stack ? ([stack.id, stack.count] as [number, number]) : null
    );
}

/** Total count of an item across all slots. */
export function countOf(inv: Inventory, itemId: number): number {
    let n = 0;
    for (const stack of inv.slots) {
        if (stack?.id === itemId) n += stack.count;
    }
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
