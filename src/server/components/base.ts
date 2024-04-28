import { Component } from "../game_engine/component.js";

export type Physics = {
    position: SAT.Vector;
    collider: SAT.Circle;
    rotation: number;
    size: number;
    solid: boolean;
    speed: number;
};
export const Physics = Component.register<Physics>();

export type CalculateCollisions = {};
export const CalculateCollisions = Component.register<CalculateCollisions>();

export type Type = { id: number; variant?: number };
export const Type = Component.register<Type>();

export type EntityAI = {
    target: SAT.Vector;
    arriveTime: number;
    travelTime: number;
    lastPosition: SAT.Vector;
    lastMoveTime: number;
};
export const EntityAI = Component.register<EntityAI>();

export type GroundData = {
    collider: SAT.Box;
    type: number;
    speedMultiplier: number;
};
export const GroundData = Component.register<GroundData>();

export type Flags = Set<number>;
export const Flags = Component.register<Flags>();

export type GroundItemData = {
    id: number;
    amount: number;
    despawnTime: number;
};
export const GroundItemData = Component.register<GroundItemData>();

export type ResourceData = {
    items: Record<number, number>;
    decayAt: number | null;
    lastRegen: number;
};
export const ResourceData = Component.register<ResourceData>();

export type ModifierType = "add" | "multiply";

export class ModifiersData {
    types: Record<
        string,
        Record<
            string,
            { operation: ModifierType; value: number; expires?: number }
        >
    > = {};

    clear(name: string, type?: string) {
        if (type) {
            const modType = this.types[type];
            if (modType) delete modType[name];
            return;
        }
        for (const modType of Object.values(this.types)) {
            delete modType[name];
        }
    }

    calc(base: number, type: string) {
        const modType = this.types[type];
        if (modType === undefined) return base;

        const add: number[] = [];
        const multiply: number[] = [];
        for (const [key, modifier] of Object.entries(modType)) {
            if (modifier.expires) {
                if (modifier.expires < Date.now()) {
                    delete modType[key];
                }
            }
            if (modifier.operation === "add") {
                add.push(modifier.value);
                continue;
            }
            multiply.push(modifier.value);
        }
        for (const value of add) {
            base += value;
        }
        for (const value of multiply) {
            base *= value;
        }
        return base;
    }

    set(
        type: string,
        name: string,
        operation: "add" | "multiply",
        value: number,
        duration?: number
    ) {
        if (!this.types[type]) this.types[type] = {};
        this.types[type][name] = { operation, value };
        if (duration) this.types[type][name].expires = Date.now() + duration;
    }
}
export const Modifiers = Component.register<ModifiersData>();
