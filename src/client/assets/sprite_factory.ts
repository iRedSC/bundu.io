import * as PIXI from "pixi.js";
import { assets } from "./load";
import { radians } from "../../lib/transforms";
import { idMap } from "../configs/id_map";
import { mergeObjects } from "../../lib/object_utils";

type DisplayConfig = { x: number; y: number; scale: number; rotation: number };

const DEFAULT_CONFIG = { x: 0, y: 0, scale: 1, rotation: 0 };
export class SpriteFactory {
    static build(texture: string | number, config?: Partial<DisplayConfig>) {
        if (typeof texture === "number") {
            texture = idMap.getv(texture) || "";
        }
        const fullConfig = mergeObjects<DisplayConfig>(
            undefined,
            config,
            DEFAULT_CONFIG
        );
        const sprite = new PIXI.Sprite(assets(texture));
        sprite.x = fullConfig.x;
        sprite.y = fullConfig.y;
        sprite.scale.set(fullConfig.scale);
        sprite.rotation = radians(fullConfig.rotation);
        return sprite;
    }

    static update(
        sprite: PIXI.Sprite,
        config?: Partial<DisplayConfig>,
        texture?: string
    ) {
        const fullConfig = mergeObjects<DisplayConfig>(
            undefined,
            config,
            DEFAULT_CONFIG
        );
        sprite.x = fullConfig.x;
        sprite.y = fullConfig.y;
        sprite.scale.set(fullConfig.scale);
        sprite.rotation = radians(fullConfig.rotation);
        if (texture) {
            sprite.texture = assets(texture);
        }
        return sprite;
    }
}
