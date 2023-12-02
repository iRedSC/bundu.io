import _items from "./items.json";
import _itemTypes from "./item_types.json";

type DisplayConfig = {
    x: number;
    y: number;
    rotation: number;
    scale: number;
};

export type ItemConfig = {
    [key: string]: {
        type: string;
        sprite?: string;
        hand_display?: DisplayConfig;
        body_display?: DisplayConfig;
    };
};

export type ItemTypeConfig = {
    [key: string]: {
        hand_display?: DisplayConfig;
        body_display?: DisplayConfig;
    };
};

const items = _items as ItemConfig;
const itemTypes = _itemTypes as ItemTypeConfig;

export function getItem(name: string, require: string[]) {
    const item = items[name];
    let itemType = {};
    if (item.type) {
        itemType = itemTypes[item.type];
    }
    const returnItem = { ...itemType, ...item };
    for (let property of require) {
        if (!(property in returnItem)) {
            return null;
        }
    }
    return returnItem;
}
