/** Shared creative / debug kit definitions (item location → count). */
export const KITS: Record<string, Record<string, number>> = {
    copper: {
        "bundu:copper_pickaxe": 1,
        "bundu:copper_sword": 1,
        "bundu:copper_helmet": 1,
    },
    silver: {
        "bundu:silver_pickaxe": 1,
        "bundu:silver_sword": 1,
        "bundu:silver_helmet": 1,
    },
    cobalt: {
        "bundu:cobalt_pickaxe": 1,
        "bundu:cobalt_sword": 1,
        "bundu:cobalt_helmet": 1,
    },
    iridium: {
        "bundu:iridium_sword": 1,
        "bundu:iridium_wall": 10,
        "bundu:iridium_door": 5,
        "bundu:iridium_spike": 5,
    },
};

export const KIT_IDS = Object.keys(KITS) as (keyof typeof KITS)[];

export function isKitId(value: string): value is keyof typeof KITS {
    return Object.hasOwn(KITS, value);
}
