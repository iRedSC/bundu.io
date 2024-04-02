import { intersection } from "../../lib/set_transforms.js";
import { Component } from "../game_engine/component.js";
import { GameWS } from "../network/websockets.js";

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

    update(objects: Set<number>) {
        this.old = structuredClone(this.objects);
        this.objects.clear();
        for (const object of objects.values()) {
            this.add(object);
        }
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
        const value = structuredClone(this.new);
        this.new.clear();
        return value;
    }
}

export type PlayerData = {
    socket: GameWS;
    name: string;
    visibleObjects: VisibleObjects;

    playerSkin: number;
    backpackSkin: number;
    bookSkin: number;

    selectedItem?: number;
    helmet?: number;
    backpack?: boolean;

    moveDir: [number, number];
};
export const PlayerData = Component.register<PlayerData>();
