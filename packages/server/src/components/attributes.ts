import { Component } from "../engine";

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
    "health.defense.blocking",

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

type AttributeCallback = (value: number) => void;

type AttributeModifier = {
    operation: AttributeOperations;
    value: number;
    /** Absolute `world.gameTime` when this modifier expires. */
    expires?: number;
};

/**
 * Container for arbitrary attributes.
 *
 * Timed modifiers expire against `world.gameTime` (via {@link expire} / {@link now}),
 * not wall-clock `Date.now()`.
 */
export class AttributesData {
    types: Partial<Record<AttributeType, Record<string, AttributeModifier>>>;

    private callbacks: Partial<Record<AttributeType, Set<AttributeCallback>>>;

    /** Latest gameTime from the attributes system tick. */
    now = 0;

    constructor() {
        this.types = {};
        this.callbacks = {};
    }

    private notify(type: AttributeType): void {
        const callbacks = this.callbacks[type];
        if (!callbacks) return;
        const value = this.get(type);
        for (const callback of callbacks.values()) callback(value);
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
            this.notify(type);
            return;
        }
        for (const name of Object.keys(this.types) as AttributeType[]) {
            const record = this.types[name];
            if (!record) continue;
            delete record[id];
            this.notify(name);
        }
    }

    /**
     * Drop modifiers whose `expires` is at or before `now`, then notify listeners.
     * Driven by the attributes system each tick.
     */
    expire(now: number): void {
        this.now = now;
        for (const type of Object.keys(this.types) as AttributeType[]) {
            const modType = this.types[type];
            if (!modType) continue;
            let changed = false;
            for (const [key, modifier] of Object.entries(modType)) {
                if (
                    modifier.expires !== undefined &&
                    modifier.expires <= now
                ) {
                    delete modType[key];
                    changed = true;
                }
            }
            if (changed) this.notify(type);
        }
    }

    /**
     * Retrieve an attribute type calculated based on all of the modifiers.
     * Expired modifiers (vs {@link now}) are skipped until {@link expire} removes them.
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
        for (const modifier of Object.values(modType)) {
            if (
                modifier.expires !== undefined &&
                modifier.expires <= this.now
            ) {
                continue;
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
     * @param duration optional duration in gameTime ms
     * @param now optional gameTime when the modifier is applied (defaults to {@link now})
     */
    set(
        type: AttributeType,
        id: string,
        operation: "add" | "multiply",
        value: number,
        duration?: number,
        now?: number
    ) {
        if (!this.types[type]) this.types[type] = {};
        const modifier: AttributeModifier = { operation, value };
        if (duration !== undefined) {
            modifier.expires = (now ?? this.now) + duration;
        }
        this.types[type]![id] = modifier;

        this.notify(type);
        return this;
    }

    addEventListener(type: AttributeType, callback: AttributeCallback): void {
        if (!this.callbacks[type]) this.callbacks[type] = new Set();
        this.callbacks[type]?.add(callback);
    }

    removeEventListener(
        type: AttributeType,
        callback: AttributeCallback
    ): void {
        this.callbacks[type]?.delete(callback);
    }
}

export const Attributes = Component.register(() => new AttributesData());
