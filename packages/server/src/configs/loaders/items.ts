import { ConfigLoader } from "./loader.js";

export type ItemAttribute = {
    op: "add" | "multiply";
    value: number;
};

export type ItemConfig = {
    type: string | null;
    function: string | null;
    level: number;
    attributes: Record<string, ItemAttribute>;
    stats: Record<string, number>;
    flags: string[];
    unequip_delay: number;
};

const fallback: ItemConfig = {
    type: null,
    function: null,
    level: 0,
    attributes: {},
    stats: {},
    flags: [],
    unequip_delay: 0,
};

export const ItemConfigs = new ConfigLoader<ItemConfig>(fallback);
