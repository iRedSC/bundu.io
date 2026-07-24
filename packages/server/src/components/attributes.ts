import { Component } from "../engine";

/**
 * Flat registry of attribute paths. Dot segments form a tree for inheritance:
 * `attack.damage` contributes to `attack.damage.building`, etc.
 * Nodes in {@link NON_INHERITING_ATTRIBUTES} resolve only their own modifiers.
 */
export const AttributeList = [
    "attack.damage",
    "attack.damage.building",
    "attack.damage.animal",
    "attack.speed",
    "attack.origin",
    "attack.reach",
    "attack.sweep",

    "movement.speed",

    "physics.scale",

    "placement.reach",
    "interaction.reach",

    "health.max",
    "health.regen_amount",
    "health.defense",
    "health.defense.blocking",

    "hunger.max",
    "hunger.nourishment",
    "hunger.cancel_regen_below",
    "hunger.cancel_regen_above",
    "eating.movement_speed_multiplier",

    "crafting.multiplier",
    "crafting.speed",

    "temperature.max",
    "temperature.warmth",
    "temperature.insulation",
    "temperature.insulation.up",
    "temperature.insulation.down",
    "temperature.cancel_regen_below",
    "temperature.cancel_regen_above",

    "thirst.max",
    "thirst.hydration",
    "thirst.cancel_regen_below",
    "thirst.cancel_regen_above",

    "air.max",
    "air.oxygen",
    "air.cancel_regen_below",
    "air.cancel_regen_above",
] as const;

export type AttributeType = (typeof AttributeList)[number];

export const AttributeOperationList = ["addBase", "add", "multiply"] as const;
export type AttributeOperations = (typeof AttributeOperationList)[number];

/** Damage channel suffix under `attack.damage` (pack / resolve). */
export type AttackDamageChannel = "building" | "animal";

/** Directional channel under `temperature.insulation` (pack / resolve). */
export type InsulationChannel = "up" | "down";

const ATTRIBUTE_SET = new Set<string>(AttributeList);

/** Children that do not fold parent modifiers into their resolved value. */
const NON_INHERITING_ATTRIBUTES = new Set<AttributeType>([
    "health.defense.blocking",
]);

export function isAttributeType(key: string): key is AttributeType {
    return ATTRIBUTE_SET.has(key);
}

export function attributeInherits(type: AttributeType): boolean {
    return !NON_INHERITING_ATTRIBUTES.has(type);
}

/**
 * Ancestor paths (root → leaf) that contribute to `type`.
 * Missing intermediate segments are skipped; non-inheriting leaves are self-only.
 */
export function attributeInheritChain(type: AttributeType): AttributeType[] {
    if (!attributeInherits(type)) return [type];
    const parts = type.split(".");
    const chain: AttributeType[] = [];
    for (let i = 1; i <= parts.length; i++) {
        const path = parts.slice(0, i).join(".");
        if (isAttributeType(path)) chain.push(path);
    }
    return chain.length > 0 ? chain : [type];
}

/** Registered descendants of `type` that inherit through it (for listeners). */
export function attributeDescendants(type: AttributeType): AttributeType[] {
    const prefix = `${type}.`;
    return AttributeList.filter(
        (path) => path.startsWith(prefix) && attributeInherits(path)
    );
}

type AttributeCallback = (value: number) => void;

type AttributeModifier = {
    operation: AttributeOperations;
    value: number;
    /** Absolute `world.gameTime` when this modifier expires. */
    expires?: number;
};

export type AttributeModifierInput = {
    operation: AttributeOperations;
    value: number;
};

/**
 * Container for arbitrary attributes.
 *
 * Timed modifiers expire against `world.gameTime` (via {@link expire} / {@link now}),
 * not wall-clock `Date.now()`.
 *
 * Resolution: for each path in the inherit chain (ancestor → self), apply
 * `(base + Σ addBase + Σ add) × Π multiply` with source ids sorted stably.
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

    private notifyTree(type: AttributeType): void {
        this.notify(type);
        for (const child of attributeDescendants(type)) {
            this.notify(child);
        }
    }

    /**
     * Remove attribute modifiers.
     * @param id id to remove from all attributes
     * @param type if specified, only removes id from this attribute type
     */
    clear(id: string, type?: AttributeType): void {
        if (type) {
            const modType = this.types[type];
            if (!modType || !(id in modType)) return;
            delete modType[id];
            this.notifyTree(type);
            return;
        }
        for (const name of Object.keys(this.types) as AttributeType[]) {
            const record = this.types[name];
            if (!record || !(id in record)) continue;
            delete record[id];
            this.notifyTree(name);
        }
    }

    /**
     * Replace every modifier for `id` with `attrs`.
     * Skips notifies when the resulting modifiers are unchanged.
     */
    replace(
        id: string,
        attrs: Partial<Record<AttributeType, AttributeModifierInput>>
    ): void {
        const keep = new Set(Object.keys(attrs) as AttributeType[]);
        for (const name of Object.keys(this.types) as AttributeType[]) {
            if (keep.has(name)) continue;
            const record = this.types[name];
            if (!record || !(id in record)) continue;
            delete record[id];
            this.notifyTree(name);
        }
        for (const [type, attr] of Object.entries(attrs) as [
            AttributeType,
            AttributeModifierInput,
        ][]) {
            this.set(type, id, attr.operation, attr.value);
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
            if (changed) this.notifyTree(type);
        }
    }

    private foldPath(type: AttributeType, base: number): number {
        const modType = this.types[type];
        if (modType === undefined) return base;

        const addBase: number[] = [];
        const add: number[] = [];
        const multiply: number[] = [];
        const sourceIds = Object.keys(modType).sort();
        for (const sourceId of sourceIds) {
            const modifier = modType[sourceId];
            if (!modifier) continue;
            if (
                modifier.expires !== undefined &&
                modifier.expires <= this.now
            ) {
                continue;
            }
            if (modifier.operation === "addBase") {
                addBase.push(modifier.value);
            } else if (modifier.operation === "add") {
                add.push(modifier.value);
            } else {
                multiply.push(modifier.value);
            }
        }
        let value = base;
        for (const amount of addBase) value += amount;
        for (const amount of add) value += amount;
        for (const amount of multiply) value *= amount;
        return value;
    }

    /**
     * Retrieve an attribute type calculated based on all of the modifiers.
     * Walks the inherit chain (ancestor → self) unless the leaf is non-inheriting.
     * Expired modifiers (vs {@link now}) are skipped until {@link expire} removes them.
     * @param type Attribute type to retrieve
     * @param base optional base value to calculate from
     * @returns calculated attribute based on all modifiers
     */
    get(type: AttributeType, base?: number): number {
        let value = base ?? 0;
        for (const path of attributeInheritChain(type)) {
            value = this.foldPath(path, value);
        }
        return value;
    }

    /**
     * Resolve `type`, optionally under a child channel
     * (e.g. `resolve("attack.damage", "building")` → `attack.damage.building`).
     */
    resolve(type: AttributeType, channel?: string): number {
        if (channel === undefined || channel === "") return this.get(type);
        const path = `${type}.${channel}`;
        if (!isAttributeType(path)) {
            throw new Error(`Unknown attribute channel "${path}"`);
        }
        return this.get(path);
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
        operation: AttributeOperations,
        value: number,
        duration?: number,
        now?: number
    ) {
        this.types[type] ??= {};
        const modifiers = this.types[type];
        const expires =
            duration !== undefined ? (now ?? this.now) + duration : undefined;
        const existing = modifiers[id];
        if (
            existing &&
            existing.operation === operation &&
            existing.value === value &&
            existing.expires === expires
        ) {
            return this;
        }
        const modifier: AttributeModifier = { operation, value };
        if (expires !== undefined) modifier.expires = expires;
        modifiers[id] = modifier;

        this.notifyTree(type);
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
