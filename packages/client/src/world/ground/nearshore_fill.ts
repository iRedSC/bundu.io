import {
    BufferImageSource,
    Rectangle,
    type Sprite,
    Texture,
    type TextureSource,
} from "pixi.js";
import { DEFAULT_OCEAN_FADE_TILES } from "@bundu/shared/ground_models";
import { TILE_SIZE, WORLD_TILES } from "@bundu/shared/tiles";
import type { LandDistanceField } from "./land_distance";

/** Ocean→land color blend distance (tiles into ocean). Extra room vs SDF soften. */
export const NEARSHORE_BLEND_TILES = DEFAULT_OCEAN_FADE_TILES;
/** Alpha fade into land after crossing the shoreline (tiles). */
export const NEARSHORE_OVERSHOOT_TILES = 2.5;

type ModelMaskEntry = {
    pixels: Uint8Array;
    source: BufferImageSource;
    texture: Texture;
};

/**
 * World-tile ocean bake split into opaque color and a separate effects mask.
 * Color alpha is always 255 — fading it mixes ocean blue into the coast.
 * Only the mask fades, and only caustics/FX sample that mask.
 *
 * Per-model FX masks keep shared shore alpha only on that water model's tiles
 * so ocean + pond can coexist with distinct caustics.
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
    private readonly modelMasks = new Map<string, ModelMaskEntry>();

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

    paint(
        field: LandDistanceField,
        oceanColorAt: (tileIndex: number) => number,
        blendTilesAt: (tileIndex: number) => number
    ): void {
        field.writeShoreRgba(
            this.maskPixels,
            oceanColorAt,
            blendTilesAt,
            NEARSHORE_OVERSHOOT_TILES
        );
        this.colorPixels.set(this.maskPixels);
        for (let i = 3; i < this.colorPixels.length; i += 4) {
            this.colorPixels[i] = 255;
        }
        this.colorSource.update();
        this.maskSource.update();
    }

    /** Drop all per-model FX masks (session reset / destroy). */
    clearModelMasks(): void {
        for (const entry of this.modelMasks.values()) {
            entry.texture.destroy(true);
        }
        this.modelMasks.clear();
    }

    /**
     * FX masks for each water model: shared shore alpha on that model's water
     * tiles plus land overshoot owned by the nearest water of that model.
     * Drops masks for models no longer present.
     */
    syncModelMasks(
        modelIds: ReadonlySet<string>,
        modelIdAt: (tileIndex: number) => string | undefined
    ): ReadonlyMap<string, Texture> {
        for (const id of [...this.modelMasks.keys()]) {
            if (modelIds.has(id)) continue;
            const entry = this.modelMasks.get(id);
            entry?.texture.destroy(true);
            this.modelMasks.delete(id);
        }

        const n = WORLD_TILES * WORLD_TILES;
        const shared = this.maskPixels;
        // Water tiles own themselves; land overshoot inherits nearest water model.
        const owner: (string | undefined)[] = new Array(n);
        const queue: number[] = [];
        for (let i = 0; i < n; i++) {
            const id = modelIdAt(i);
            if (id === undefined || !modelIds.has(id)) continue;
            owner[i] = id;
            queue.push(i);
        }
        let qi = 0;
        while (qi < queue.length) {
            const i = queue[qi++]!;
            const id = owner[i];
            if (id === undefined) continue;
            const tx = i % WORLD_TILES;
            const ty = (i / WORLD_TILES) | 0;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    const nx = tx + dx;
                    const ny = ty + dy;
                    if (
                        nx < 0 ||
                        ny < 0 ||
                        nx >= WORLD_TILES ||
                        ny >= WORLD_TILES
                    ) {
                        continue;
                    }
                    const j = ny * WORLD_TILES + nx;
                    if (owner[j] !== undefined) continue;
                    if (modelIdAt(j) !== undefined) continue;
                    if ((shared[j * 4 + 3] ?? 0) === 0) continue;
                    owner[j] = id;
                    queue.push(j);
                }
            }
        }

        for (const modelId of modelIds) {
            let entry = this.modelMasks.get(modelId);
            if (!entry) {
                const pixels = new Uint8Array(n * 4);
                const source = new BufferImageSource({
                    width: WORLD_TILES,
                    height: WORLD_TILES,
                    format: "rgba8unorm",
                    scaleMode: "linear",
                    addressMode: "clamp-to-edge",
                    alphaMode: "no-premultiply-alpha",
                    resource: pixels,
                });
                entry = {
                    pixels,
                    source,
                    texture: new Texture({ source }),
                };
                this.modelMasks.set(modelId, entry);
            }
            const { pixels, source } = entry;
            pixels.fill(0);
            for (let i = 0; i < n; i++) {
                if (owner[i] !== modelId) continue;
                const o = i * 4;
                pixels[o] = shared[o] ?? 0;
                pixels[o + 1] = shared[o + 1] ?? 0;
                pixels[o + 2] = shared[o + 2] ?? 0;
                pixels[o + 3] = shared[o + 3] ?? 0;
            }
            source.update();
        }

        const out = new Map<string, Texture>();
        for (const [id, entry] of this.modelMasks) {
            out.set(id, entry.texture);
        }
        return out;
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
    state.map?.destroy(false);
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
