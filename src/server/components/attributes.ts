import { Component } from "../game_engine/component.js";

export const AttributeList = [
    "attack.damage",
    "attack.speed",
    "attack.origin",
    "attack.reach",
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
export type AttributeType = (typeof AttributeList)[number];

export type AttributeOperations = "add" | "multiply";

/**
 * Container for arbitrary attributes.
 *
 * Allows you to add attributes with either the "add" or "multiply" operation.
 */
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

    /**
     * Remove attribute modifiers.
     * @param id id to remove from all attributes
     * @param type if specified, only removes id from this attribute type
     */
    clear(id: string, type?: AttributeType): void {
        if (type) {
            const modType = this.types[type];
            if (modType) delete modType[id];
            return;
        }
        for (const modType of Object.values(this.types)) {
            delete modType[id];
        }
    }

    /**
     * Retrieve an attribute type calculated based on all of the modifiers.
     * @param type Attribute type to retrieve
     * @param base optional base value to calculate from
     * @returns calculated attribute based on all modifiers
     */
    get(type: AttributeType, base?: number): number {
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

    /**
     *
     * @param type attribute type to set
     * @param id id of modifier
     * @param operation operation to use when calculating
     * @param value value of the modifier
     * @param duration optional duration for the modifier to last. (ms)
     */
    set(
        type: AttributeType,
        id: string,
        operation: "add" | "multiply",
        value: number,
        duration?: number
    ) {
        if (!this.types[type]) this.types[type] = {};
        this.types[type]![id] = { operation, value };
        if (duration) this.types[type]![id].expires = Date.now() + duration;
    }
}

export const Attributes = Component.register(() => new AttributesData());
