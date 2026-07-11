import { mergeObjects } from "@bundu/shared/object_utils";

export type DisplayConfig = {
    x: number;
    y: number;
    rotation: number;
    scale: number;
};

export type SpriteConfig = {
    type: string;
    sprite: string;
    hand_display?: Partial<DisplayConfig>;
    body_display?: Partial<DisplayConfig>;
    world_display?: Partial<DisplayConfig>;
};

export type SpriteList = {
    [key: string]: SpriteConfig;
};

export type SpriteTypeConfig = {
    hand_display?: DisplayConfig;
    body_display?: DisplayConfig;
    world_display?: DisplayConfig;
};

export type SpriteTypeList = {
    [key: string]: SpriteTypeConfig;
};

export type FullItemConfig = {
    type: string;
    sprite: string;
    hand_display: DisplayConfig;
    body_display: DisplayConfig;
    world_display: DisplayConfig;
};

const FALLBACK_DISPLAY_CONFIG: DisplayConfig = {
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
};

/** Merge type defaults + per-item overrides into a plain record. */
export function buildSpriteConfigs(
    sprites: SpriteList,
    spriteTypes: SpriteTypeList
): Record<string, FullItemConfig> {
    const result: Record<string, FullItemConfig> = {};
    for (const [name, config] of Object.entries(sprites)) {
        if (!config.type) continue;
        const itemType = spriteTypes[config.type] || {};
        result[name] = {
            type: config.type,
            sprite: config.sprite,
            hand_display: mergeObjects(
                itemType.hand_display,
                config.hand_display,
                FALLBACK_DISPLAY_CONFIG
            ),
            body_display: mergeObjects(
                itemType.body_display,
                config.body_display,
                FALLBACK_DISPLAY_CONFIG
            ),
            world_display: mergeObjects(
                itemType.world_display,
                config.world_display,
                FALLBACK_DISPLAY_CONFIG
            ),
        };
    }
    return result;
}
