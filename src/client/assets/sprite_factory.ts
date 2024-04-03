import * as PIXI from "pixi.js";
import { assets } from "./load";
import { degrees } from "../../lib/transforms";

type DisplayConfig = { x: number; y: number; scale: number; rotation: number };

export class SpriteFactory {
    static build(texture: string, config: DisplayConfig) {
        const sprite = new PIXI.Sprite(assets(texture));
        sprite.x = config.x;
        sprite.y = config.y;
        sprite.scale.set(config.scale);
        sprite.rotation = degrees(config.rotation);
        return sprite;
    }

    static update(
        sprite: PIXI.Sprite,
        config: DisplayConfig,
        texture?: string
    ) {
        sprite.x = config.x;
        sprite.y = config.y;
        sprite.scale.set(config.scale);
        sprite.rotation = degrees(config.rotation);
        if (texture) {
            sprite.texture = assets(texture);
        }
        return sprite;
    }
}
