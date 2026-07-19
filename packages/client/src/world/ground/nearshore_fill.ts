import {
    BufferImageSource,
    Rectangle,
    type Sprite,
    Texture,
    type TextureSource,
} from "pixi.js";
import { TILE_SIZE, WORLD_TILES } from "@bundu/shared/tiles";
import type { LandDistanceField } from "./land_distance";

/** Ocean→land color blend distance (tiles into ocean). Extra room vs SDF soften. */
export const NEARSHORE_BLEND_TILES = 12;
/** Alpha fade into land after crossing the shoreline (tiles). */
export const NEARSHORE_OVERSHOOT_TILES = 2.5;

/**
 * World-tile ocean bake split into opaque color and a separate effects mask.
 * Color alpha is always 255 — fading it mixes ocean blue into the coast.
 * Only the mask fades, and only caustics/FX sample that mask.
 */
export class NearshoreFill {
    private readonly maskPixels = new Uint8Array(
        WORLD_TILES * WORLD_TILES * 4
    );
    private readonly colorPixels = new Uint8Array(
        WORLD_TILES * WORLD_TILES * 4
    );
    private readonly maskSource: BufferImageSource;
    private readonly colorSource: BufferImageSource;
    readonly colorTexture: Texture;
    readonly maskTexture: Texture;
    private oceanColor = 0x1a5f8a;

    constructor() {
        const sourceOptions = {
            width: WORLD_TILES,
            height: WORLD_TILES,
            format: "rgba8unorm",
            scaleMode: "linear",
            addressMode: "clamp-to-edge",
            alphaMode: "no-premultiply-alpha",
        } as const;
        this.colorSource = new BufferImageSource({
            ...sourceOptions,
            resource: this.colorPixels,
        });
        this.maskSource = new BufferImageSource({
            ...sourceOptions,
            resource: this.maskPixels,
        });
        this.colorTexture = new Texture({ source: this.colorSource });
        this.maskTexture = new Texture({ source: this.maskSource });
    }

    setOceanColor(oceanColor: number): void {
        this.oceanColor = oceanColor;
    }

    paint(field: LandDistanceField): void {
        field.writeShoreRgba(
            this.maskPixels,
            this.oceanColor,
            NEARSHORE_BLEND_TILES,
            NEARSHORE_OVERSHOOT_TILES
        );
        this.colorPixels.set(this.maskPixels);
        for (let i = 3; i < this.colorPixels.length; i += 4) {
            this.colorPixels[i] = 255;
        }
        this.colorSource.update();
        this.maskSource.update();
    }
}

export type NearshoreBindState = {
    map?: Texture;
    source?: TextureSource;
};

/** Map a sprite onto the patch's tile rect of the shared shore texture. */
export function bindNearshoreSprite(
    sprite: Sprite,
    bounds: Rectangle,
    map: Texture,
    state: NearshoreBindState
): void {
    if (state.source === map.source && state.map) return;
    state.source = map.source;
    state.map = new Texture({
        source: map.source,
        frame: new Rectangle(
            bounds.x / TILE_SIZE,
            bounds.y / TILE_SIZE,
            bounds.width / TILE_SIZE,
            bounds.height / TILE_SIZE
        ),
    });
    sprite.texture = state.map;
    sprite.tint = 0xffffff;
    sprite.position.set(bounds.x, bounds.y);
    sprite.width = bounds.width;
    sprite.height = bounds.height;
}
