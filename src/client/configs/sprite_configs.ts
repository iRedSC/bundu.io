import _sprites from "./sprites.yml";
import _spriteTypes from "./sprite_types.yml";
import { mergeObjects } from "../../lib/object_utils.js";

type DisplayConfig = {
    x: number;
    y: number;
    rotation: number;
    scale: number;
};

type SpriteConfig = {
    type: string;
    sprite: string;
    hand_display?: Partial<DisplayConfig>;
    body_display?: Partial<DisplayConfig>;
    world_display?: Partial<DisplayConfig>;
};

export type SpriteList = {
    [key: string]: SpriteConfig;
};

type SpriteTypeConfig = {
    hand_display?: DisplayConfig;
    body_display?: DisplayConfig;
    world_display?: DisplayConfig;
};

export type SpriteTypeList = {
    [key: string]: SpriteTypeConfig;
};

const sprites = _sprites as SpriteList;
const spriteTypes = _spriteTypes as SpriteTypeList;

type FullItemConfig = {
    type: string;
    sprite: string;
    hand_display: DisplayConfig;
    body_display: DisplayConfig;
    world_display: DisplayConfig;
};
const FALLBACK_DISPLAY_CONFIG: DisplayConfig = {
    x: 0,
    y: 0,
    scale: 0,
    rotation: 0,
};

export const spriteConfigs = new Map<string, FullItemConfig>();

for (const [name, config] of Object.entries(sprites)) {
    let itemType: SpriteTypeConfig = {};
    if (config.type) {
        itemType = spriteTypes[config.type] || {};
        config.hand_display = mergeObjects(
            itemType.hand_display,
            config.hand_display,
            FALLBACK_DISPLAY_CONFIG
        );
        config.body_display = mergeObjects(
            itemType.body_display,
            config.body_display,
            FALLBACK_DISPLAY_CONFIG
        );

        config.world_display = mergeObjects(
            itemType.world_display,
            config.world_display,
            FALLBACK_DISPLAY_CONFIG
        );
        spriteConfigs.set(name, config as FullItemConfig);
    }
}
