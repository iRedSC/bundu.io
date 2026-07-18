import type { RegistryId } from "@bundu/shared/registry";
import { ConfigLoader } from "./loader.js";
import type { ContextBundle } from "./effect_context.js";

export type ItemConfig = ContextBundle & {
    type: string | null;
    function: string | null;
    level: number;
    stats: Record<string, number>;
    unequip_delay: number;
    can_saturate: boolean;
    eat_duration_ms: number;
    places: RegistryId<"structure"> | null;
};

const fallback: ItemConfig = {
    type: null,
    function: null,
    level: 0,
    stats: {},
    unequip_delay: 0,
    can_saturate: false,
    eat_duration_ms: 1000,
    places: null,
};

export const ItemConfigs = new ConfigLoader<"item", ItemConfig>("item", fallback);
