import { Component } from "../game_engine/component";
import { GameWS } from "../network/websockets";

class VisibleObjects {
    private oldObjects: Set<number>;
    objects: Set<number>;
    new: Set<number>;

    constructor() {
        this.objects = new Set();
        this.new = new Set();
    }

    add(id: number): boolean {
        this.objects.add(id);
        const exists = this.oldObjects.has(id);
        if (exists) {
            return false;
        }
        this.new.add(id);
        return true;
    }
    clear() {
        this.oldObjects = structuredClone(this.objects);
        this.objects.clear();
        this.new.clear();
    }

    has(id: number) {
        return this.objects.has(id);
    }

    getAll() {
        return this.objects.values();
    }

    getNew() {
        const values = this.new.values();
        this.new.clear();
        return values;
    }
}

export type PlayerData = {
    socket: GameWS;
    name: string;
    visibleObject: VisibleObjects;

    playerSkin: number;
    backpackSkin: number;
    bookSkin: number;

    selectedItem: number;
    helmet: number;
    backpack: boolean;
};
export const PlayerData = Component.register<PlayerData>();
