import _sprites from "./sprites.yml";
import _spriteTypes from "./sprite_types.yml";
import {
    buildSpriteConfigs,
    type FullItemConfig,
    type SpriteList,
    type SpriteTypeList,
} from "./build_sprite_configs";

export type {
    DisplayConfig,
    FullItemConfig,
    SpriteList,
    SpriteTypeList,
} from "./build_sprite_configs";
export { buildSpriteConfigs } from "./build_sprite_configs";

export const spriteConfigs = new Map<string, FullItemConfig>();

const initial = buildSpriteConfigs(
    _sprites as SpriteList,
    _spriteTypes as SpriteTypeList
);
for (const [name, config] of Object.entries(initial)) {
    spriteConfigs.set(name, config);
}
