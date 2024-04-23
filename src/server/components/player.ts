import { Component } from "../game_engine/component.js";
import { intersection } from "../../lib/set_transforms.js";

// update: 7, 1, 5, 2

// always changes on update
// objects: 80, 4, 60, 1 -> 7, 1, 5, 2
// any objects not in old
// new: 80, 4, 60, 1 -> 7, 5, 2
// old:  5, 7 -> 80, 4, 60, 1
export class VisibleObjects {
    old: Set<number>;
    objects: Set<number>;
    new: Set<number>;

    constructor() {
        this.objects = new Set();
        this.new = new Set();
        this.old = new Set();
    }

    update(objects: number[]) {
        this.old = structuredClone(this.objects);
        this.objects.clear();
        for (const object of objects) {
            this.add(object);
        }
        return Array.from(intersection(this.old, this.objects, true));
    }

    add(id: number): boolean {
        this.objects.add(id);
        const exists = this.old.has(id);
        if (exists) {
            return false;
        }
        this.new.add(id);
        return true;
    }

    clear() {
        this.new.clear();
    }

    delete(value: number) {
        this.new.delete(value);
        this.objects.delete(value);
    }

    has(id: number) {
        return this.objects.has(id);
    }

    getAll() {
        return structuredClone(this.objects);
    }

    getNew() {
        const value = Array.from(this.new);
        this.new.clear();
        return value;
    }
}

export type PlayerData = {
    name: string;
    visibleObjects: VisibleObjects;

    playerSkin: number;
    backpackSkin: number;
    bookSkin: number;

    mainHand?: number;
    offHand?: number;
    helmet?: number;
    backpack?: boolean;

    moveDir: [number, number];
    attacking?: boolean;
    blocking?: boolean;
    lastAttackTime?: number;
};
export const PlayerData = Component.register<PlayerData>();

export type Inventory = {
    slots: number;
    items: Map<number, number>;
};
export const Inventory = Component.register<Inventory>();
