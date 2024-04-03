import _items from "./items.yml";
import _itemTypes from "./item_types.yml";

type DisplayConfig = {
    x: number;
    y: number;
    rotation: number;
    scale: number;
};

type ItemConfig = {
    type: string;
    sprite: string;
    hand_display?: Partial<DisplayConfig>;
    body_display?: Partial<DisplayConfig>;
};

export type ItemList = {
    [key: string]: ItemConfig;
};

type ItemTypeConfig = {
    hand_display?: DisplayConfig;
    body_display?: DisplayConfig;
};

export type ItemTypeList = {
    [key: string]: ItemTypeConfig;
};

function mergeObj(...arr: object[]) {
    return arr.reduce((acc, val) => {
        return { ...acc, ...val };
    }, {});
}

const items = _items as ItemList;
const itemTypes = _itemTypes as ItemTypeList;

function mergeDisplayConfig(
    itemTypeConfig: DisplayConfig | undefined,
    overrideConfig?: Partial<DisplayConfig>
): DisplayConfig {
    const baseConfig = { x: 0, y: 0, rotation: 0, scale: 1 };
    return mergeObj(
        baseConfig,
        itemTypeConfig || {},
        overrideConfig || {}
    ) as DisplayConfig;
}

type FullItemConfig = {
    type: string;
    sprite: string;
    hand_display: DisplayConfig;
    body_display: DisplayConfig;
};

export const itemConfigs = new Map<string, FullItemConfig>();

for (const [name, config] of Object.entries(items)) {
    let itemType: ItemTypeConfig = {};
    if (config.type) {
        itemType = itemTypes[config.type] || {};
        if ("hand_display" in itemType) {
            config.hand_display = mergeDisplayConfig(
                itemType.hand_display,
                config.hand_display
            );
        }
        if ("body_display" in itemType) {
            config.body_display = mergeDisplayConfig(
                itemType.body_display,
                config.body_display
            );
        }
        itemConfigs.set(name, config as FullItemConfig);
    }
}
