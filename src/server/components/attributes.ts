import { Component } from "../game_engine/component.js";

export const AttributeList = [
    "attack.damage",
    "attack.speed",
    "attack.reach_start",
    "attack.reach_end",
    "attack.sweep",

    "movement.speed",

    "health.max",
    "health.regen_amount",
    "health.defense",

    "hunger.max",
    "hunger.depletion_amount",

    "temperature.max",
    "temperature.warmth",
    "temperature.insulation",

    "water.max",
    "water.depletion_amount",
] as const;
type AttributeType = (typeof AttributeList)[number];

export type AttributeOperations = "add" | "multiply";

export class AttributesData {
    types: Partial<
        Record<
            AttributeType,
            Record<
                string,
                {
                    operation: AttributeOperations;
                    value: number;
                    expires?: number;
                }
            >
        >
    >;

    constructor() {
        this.types = {};
    }

    clear(name: string, type?: AttributeType) {
        if (type) {
            const modType = this.types[type];
            if (modType) delete modType[name];
            return;
        }
        for (const modType of Object.values(this.types)) {
            delete modType[name];
        }
    }

    get(type: AttributeType, base?: number) {
        base = base ?? 0;
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
        type: AttributeType,
        name: string,
        operation: "add" | "multiply",
        value: number,
        duration?: number
    ) {
        if (!this.types[type]) this.types[type] = {};
        this.types[type]![name] = { operation, value };
        if (duration) this.types[type]![name].expires = Date.now() + duration;
    }
}

export const Attributes = Component.register(() => new AttributesData());
