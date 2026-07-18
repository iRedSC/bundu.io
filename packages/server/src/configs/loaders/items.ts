import type { RegistryId } from "@bundu/shared/registry";
import { ConfigLoader } from "./loader.js";
import type { OcclusionHide } from "./occlusion_hide.js";

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
    can_saturate: boolean;
    eat_duration_ms: number;
    places: RegistryId<"structure"> | null;
    /** Hide identity from outsiders while this item is equipped (e.g. ninja hood). */
    occlusionHide?: OcclusionHide;
};

const fallback: ItemConfig = {
    type: null,
    function: null,
    level: 0,
    attributes: {},
    stats: {},
    flags: [],
    unequip_delay: 0,
    can_saturate: false,
    eat_duration_ms: 1000,
    places: null,
};

export const ItemConfigs = new ConfigLoader<"item", ItemConfig>("item", fallback);
