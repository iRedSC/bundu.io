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
    sprite?: string;
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

const items = _items as ItemList;
const itemTypes = _itemTypes as ItemTypeList;

function mergeDisplayConfig(
    itemTypeConfig: DisplayConfig | undefined,
    overrideConfig?: Partial<DisplayConfig>
): DisplayConfig {
    return {
        x:
            overrideConfig?.x !== undefined
                ? overrideConfig.x
                : itemTypeConfig?.x || 0,
        y:
            overrideConfig?.y !== undefined
                ? overrideConfig.y
                : itemTypeConfig?.y || 0,
        rotation:
            overrideConfig?.rotation !== undefined
                ? overrideConfig.rotation
                : itemTypeConfig?.rotation || 0,
        scale:
            overrideConfig?.scale !== undefined
                ? overrideConfig.scale
                : itemTypeConfig?.scale || 1,
    };
}

type ReturnItem = {
    type: string;
    sprite?: string;
    hand_display?: DisplayConfig;
    body_display?: DisplayConfig;
};

export function getItem(name: string, require: string[]): ReturnItem | null {
    const item = items[name];
    if (!item) {
        return null;
    }
    let itemType: ItemTypeConfig = {};
    if (item.type) {
        itemType = itemTypes[item.type] || {};
        if ("hand_display" in itemType) {
            item.hand_display = mergeDisplayConfig(
                itemType.hand_display,
                item.hand_display
            );
        }
        if ("body_display" in itemType) {
            item.body_display = mergeDisplayConfig(
                itemType.body_display,
                item.body_display
            );
        }
    }

    const returnItem = { ...itemType, ...item };
    for (let property of require) {
        if (!(property in returnItem)) {
            return null;
        }
    }
    return returnItem as ReturnItem;
}
