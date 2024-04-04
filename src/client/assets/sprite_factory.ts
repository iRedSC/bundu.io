import * as PIXI from "pixi.js";
import { assets } from "./load";
import { radians } from "../../lib/transforms";

type DisplayConfig = { x: number; y: number; scale: number; rotation: number };

const DEFAULT_CONFIG = { x: 0, y: 0, scale: 1, rotation: 0 };
export class SpriteFactory {
    static build(texture: string, config: DisplayConfig = DEFAULT_CONFIG) {
        const sprite = new PIXI.Sprite(assets(texture));
        sprite.x = config.x;
        sprite.y = config.y;
        sprite.scale.set(config.scale);
        sprite.rotation = radians(config.rotation);
        return sprite;
    }

    static update(
        sprite: PIXI.Sprite,
        config: DisplayConfig = DEFAULT_CONFIG,
        texture?: string
    ) {
        sprite.x = config.x;
        sprite.y = config.y;
        sprite.scale.set(config.scale);
        sprite.rotation = radians(config.rotation);
        if (texture) {
            sprite.texture = assets(texture);
        }
        return sprite;
    }
}
