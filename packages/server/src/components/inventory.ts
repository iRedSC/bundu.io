import { Component } from "../engine";

export type Inventory = {
    slots: number;
    items: Map<number, number>;
};
export const Inventory = Component.register<Inventory>(() => ({
    slots: 10,
    items: new Map(),
}));
