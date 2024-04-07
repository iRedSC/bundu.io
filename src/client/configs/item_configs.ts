import _items from "./items.yml";
import _itemTypes from "./item_types.yml";
import { mergeObjects } from "../../lib/object_utils.js";

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

const items = _items as ItemList;
const itemTypes = _itemTypes as ItemTypeList;

type FullItemConfig = {
    type: string;
    sprite: string;
    hand_display: DisplayConfig;
    body_display: DisplayConfig;
};
const FALLBACK_DISPLAY_CONFIG: DisplayConfig = {
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
};

export const itemConfigs = new Map<string, FullItemConfig>();

for (const [name, config] of Object.entries(items)) {
    let itemType: ItemTypeConfig = {};
    if (config.type) {
        itemType = itemTypes[config.type] || {};
        if ("hand_display" in itemType) {
            config.hand_display = mergeObjects(
                itemType.hand_display,
                config.hand_display,
                FALLBACK_DISPLAY_CONFIG
            );
        }
        if ("body_display" in itemType) {
            config.body_display = mergeObjects(
                itemType.body_display,
                config.body_display,
                FALLBACK_DISPLAY_CONFIG
            );
        }
        itemConfigs.set(name, config as FullItemConfig);
    }
}
