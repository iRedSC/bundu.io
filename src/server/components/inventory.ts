import { Component } from "../game_engine/component.js";

export namespace InventoryTools {
    export function isFull(inventory: Inventory): boolean {
        if (inventory.items.size >= inventory.slots) {
            return true;
        }
        return false;
    }
}

export type Inventory = {
    slots: number;
    items: Map<number, number>;
};
export const Inventory = Component.register<Inventory>(() => ({
    slots: 10,
    items: new Map(),
}));
