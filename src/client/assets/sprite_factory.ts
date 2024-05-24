import { ColorSource, Container, IDestroyOptions, Sprite } from "pixi.js";
import { assets } from "./load";
import { idMap } from "../configs/id_map";
import { mergeObjects } from "../../lib/object_utils";
import { radians } from "../../lib/transforms";

export class ContaineredSprite extends Container {
    sprite: Sprite;

    constructor(sprite: Sprite) {
        super();
        this.sprite = sprite;
        this.addChild(sprite);
    }

    set tint(value: ColorSource) {
        this.sprite.tint = value;
    }

    get tint() {
        return this.sprite.tint;
    }

    get anchor() {
        return this.sprite.anchor;
    }

    setPivot(x: number, y?: number) {
        this.pivot.set(this.width * x, y ? this.height * y : undefined);
    }

    destroy(options?: IDestroyOptions) {
        this.sprite.destroy(options);
        super.destroy(options);
    }
}

export function normalizeSprite(sprite: Sprite, baseScale: number = 1) {
    // Get the width and height of the texture
    const texture = sprite.texture;

    // Calculate the scale factor for both width and height
    const scaleFactorX = 1 / texture.width;
    const scaleFactorY = 1 / texture.height;

    // Choose the minimum scale factor to maintain aspect ratio
    const scaleFactor = Math.min(scaleFactorX, scaleFactorY);

    // Apply the scale factor to the sprite
    sprite.width = baseScale * scaleFactor * texture.width;
    sprite.height = baseScale * scaleFactor * texture.height;
}

type DisplayConfig = { x: number; y: number; scale: number; rotation: number };

const DEFAULT_CONFIG = { x: 0, y: 0, scale: 1, rotation: 0 };
export class SpriteFactory {
    static build(
        texture: string | number,
        config?: Partial<DisplayConfig>
    ): ContaineredSprite {
        if (typeof texture === "number") {
            texture = idMap.getv(texture) || "";
        }
        const fullConfig = mergeObjects<DisplayConfig>(
            undefined,
            config,
            DEFAULT_CONFIG
        );

        const sprite = new Sprite(assets(texture));
        sprite.x = fullConfig.x;
        sprite.y = fullConfig.y;
        normalizeSprite(sprite, fullConfig.scale);
        sprite.rotation = radians(fullConfig.rotation);
        const container = new ContaineredSprite(sprite);
        return container;
    }

    static update(
        container: ContaineredSprite,
        config?: Partial<DisplayConfig>,
        texture?: string
    ) {
        const sprite = container.sprite;
        const fullConfig = mergeObjects<DisplayConfig>(
            undefined,
            config,
            DEFAULT_CONFIG
        );
        if (texture) {
            sprite.texture = assets(texture);
        }
        sprite.x = fullConfig.x;
        sprite.y = fullConfig.y;
        normalizeSprite(sprite, fullConfig.scale);
        sprite.rotation = radians(fullConfig.rotation);
        return container;
    }
}
