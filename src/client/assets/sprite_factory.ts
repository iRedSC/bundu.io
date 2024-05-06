import { Sprite, Texture } from "pixi.js";
import { assets } from "./load";
import { idMap } from "../configs/id_map";
import { mergeObjects } from "../../lib/object_utils";
import { BasicPoint } from "../../lib/types";
import { radians } from "../../lib/transforms";

export class SpriteWrapper extends Sprite {
    config: DisplayConfig;

    private _position: { x: number; y: number };
    private _rotation: number;
    private _scale: { x: number; y?: number };

    constructor(texture: Texture, config: DisplayConfig) {
        super(texture);

        this._scale = { x: 0, y: 0 };
        this._rotation = 0;
        this._position = { x: 0, y: 0 };

        this.config = config;

        this.setPosition({ x: 0, y: 0 });
        this.setRotation(0);
        this.setScale(1);
    }

    setPosition(position: BasicPoint) {
        this._position = { x: position.y, y: position.y };
        this.position.set(
            this.config.x + position.x,
            this.config.y + position.y
        );
    }

    setRotation(rotation: number) {
        this._rotation = rotation;
        this.rotation = rotation + radians(this.config.rotation);
    }

    setScale(x: number, y?: number) {
        this._scale = { x: x, y: y };
        this.scale.set(
            x + this.config.scale,
            y ? y + this.config.scale : undefined
        );
    }

    updateConfig() {
        this.setPosition(this._position);
        this.setRotation(this._rotation);
        this.setScale(this._scale.x, this._scale.y);
    }
}

type DisplayConfig = { x: number; y: number; scale: number; rotation: number };

const DEFAULT_CONFIG = { x: 0, y: 0, scale: 0, rotation: 0 };
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
        const sprite = new SpriteWrapper(assets(texture), fullConfig);
        return sprite;
    }

    static update(
        sprite: SpriteWrapper,
        config?: Partial<DisplayConfig>,
        texture?: string
    ) {
        const fullConfig = mergeObjects<DisplayConfig>(
            undefined,
            config,
            DEFAULT_CONFIG
        );
        if (texture) {
            sprite.texture = assets(texture);
        }
        sprite.config = fullConfig;
        sprite.updateConfig();
        return sprite;
    }
}
