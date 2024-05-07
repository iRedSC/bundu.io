import { Component } from "../game_engine/component.js";
import { clamp } from "../../lib/transforms.js";

export const StatList = [
    "health",
    "hunger",
    "temperature",
    "water",

    "heal_ticks",
    "poison_ticks",
] as const;
export type StatType = (typeof StatList)[number];

export type StatOperations = "add" | "multiply";

/**
 * Container for arbitrary attributes.
 *
 * Allows you to add attributes with either the "add" or "multiply" operation.
 */
export class StatsData {
    types: Partial<
        Record<
            StatType,
            {
                value: number;
                min?: number;
                max?: number;
            }
        >
    >;

    constructor() {
        this.types = {};
    }

    /**
     * Retrieve an attribute type calculated based on all of the modifiers.
     * @param type Attribute type to retrieve
     * @param base optional base value to calculate from
     * @returns calculated attribute based on all modifiers
     */
    get(type: StatType): {
        value: number;
        min?: number;
        max?: number;
    } {
        this.types[type] = this.types[type] ?? { value: 0 };
        return this.types[type]!;
    }

    /**
     *
     * @param type Stat type
     * @param value value to set the stat to
     * @param min optional min to clamp the value
     * @param max optional max to clamp the value
     */
    set(type: StatType, data: { value: number; min?: number; max?: number }) {
        this.types[type] = this.types[type] ?? data;
        let stat = this.types[type]!;
        if (data.min) stat.min = data.min;
        if (data.max) stat.max = data.max;
        stat.value = clamp(data.value, stat!.min ?? null, stat!.max ?? null);
    }
}

export const Stats = Component.register(() => new StatsData());
