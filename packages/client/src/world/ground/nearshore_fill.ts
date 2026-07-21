import {
    BufferImageSource,
    Rectangle,
    type Sprite,
    Texture,
    type TextureSource,
} from "pixi.js";
import {
    DEFAULT_OCEAN_FADE_TILES,
    DEFAULT_WATER_WATER_FADE_TILES,
} from "@bundu/shared/ground_models";
import { TILE_SIZE, WORLD_TILES } from "@bundu/shared/tiles";
import {
    type LandDistanceField,
    softenWaterWaterEdges,
} from "./land_distance";

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
    /** Authored water RGB before land→ocean shore bake (water↔water soften). */
    private readonly waterColorScratch = new Uint8Array(
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
        blendTilesAt: (tileIndex: number) => number,
        isWaterAt: (tileIndex: number) => boolean,
        transitionTiles = DEFAULT_WATER_WATER_FADE_TILES
    ): void {
        const scratch = this.waterColorScratch;
        const n = WORLD_TILES * WORLD_TILES;
        for (let i = 0; i < n; i++) {
            const o = i * 4;
            if (!isWaterAt(i)) {
                scratch[o] = 0;
                scratch[o + 1] = 0;
                scratch[o + 2] = 0;
                scratch[o + 3] = 0;
                continue;
            }
            const rgb = oceanColorAt(i);
            scratch[o] = (rgb >> 16) & 0xff;
            scratch[o + 1] = (rgb >> 8) & 0xff;
            scratch[o + 2] = rgb & 0xff;
            scratch[o + 3] = 255;
        }
        // Color-only soften between distinct ocean types — before land blend.
        softenWaterWaterEdges(
            scratch,
            isWaterAt,
            transitionTiles
        );
        field.writeShoreRgba(
            this.maskPixels,
            (i) => {
                if (!isWaterAt(i)) return oceanColorAt(i);
                const o = i * 4;
                const r = scratch[o] ?? 0;
                const g = scratch[o + 1] ?? 0;
                const b = scratch[o + 2] ?? 0;
                return ((r << 16) | (g << 8) | b) >>> 0;
            },
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

    /** Drop all per-model FX masks (full world teardown only). */
    clearModelMasks(): void {
        for (const entry of this.modelMasks.values()) {
            // destroy(false): keep BufferImageSource alive. Pixi's pooled
            // MaskFilter BindGroup still listens to it (pixijs#11994).
            entry.texture.destroy(false);
        }
        this.modelMasks.clear();
    }

    /**
     * FX masks for each water model: shared shore alpha on that model's water
     * tiles plus land overshoot owned by the nearest water of that model.
     * Drops masks for models no longer present.
     *
     * @param noOvershoot Models that stay on water tiles only (e.g. pond).
     */
    syncModelMasks(
        modelIds: ReadonlySet<string>,
        modelIdAt: (tileIndex: number) => string | undefined,
        noOvershoot?: ReadonlySet<string>,
        transitionTilesFor: (modelId: string) => number = () =>
            DEFAULT_WATER_WATER_FADE_TILES
    ): ReadonlyMap<string, Texture> {
        for (const id of [...this.modelMasks.keys()]) {
            if (modelIds.has(id)) continue;
            const entry = this.modelMasks.get(id);
            // Same as clearModelMasks — never destroy(true) while AlphaMask may bind it.
            entry?.texture.destroy(false);
            this.modelMasks.delete(id);
        }

        const n = WORLD_TILES * WORLD_TILES;
        const shared = this.maskPixels;
        // Water tiles own themselves; land overshoot inherits nearest water model
        // (skipped for noOvershoot models). Land in a noOvershoot shore ring stays
        // unowned so ocean cannot wash caustics onto pond beaches.
        const owner: (string | undefined)[] = new Array(n);
        const blocked = new Uint8Array(n);
        for (let i = 0; i < n; i++) {
            const id = modelIdAt(i);
            if (id === undefined || !modelIds.has(id)) continue;
            owner[i] = id;
        }
        const blend = materialBlend(modelIdAt, transitionTilesFor);
        // Reserve land overshoot rings around noOvershoot water (pond) — do not
        // assign them to anyone; ocean flood must not claim them.
        if (noOvershoot && noOvershoot.size > 0) {
            const reserve: number[] = [];
            for (let i = 0; i < n; i++) {
                const id = owner[i];
                if (id !== undefined && noOvershoot.has(id)) reserve.push(i);
            }
            let ri = 0;
            while (ri < reserve.length) {
                const i = reserve[ri++];
                if (i === undefined) continue;
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
                        if (blocked[j]) continue;
                        if (modelIdAt(j) !== undefined) continue;
                        if ((shared[j * 4 + 3] ?? 0) === 0) continue;
                        blocked[j] = 1;
                        reserve.push(j);
                    }
                }
            }
        }
        const queue: number[] = [];
        for (let i = 0; i < n; i++) {
            const id = owner[i];
            if (id === undefined || noOvershoot?.has(id)) continue;
            queue.push(i);
        }
        let qi = 0;
        while (qi < queue.length) {
            const i = queue[qi++];
            if (i === undefined) continue;
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
                    if (blocked[j]) continue;
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
                const owned = owner[i];
                if (owned === undefined) continue;
                let weight = owned === modelId ? 1 : 0;
                const target = blend.target[i];
                const mix = blend.mix[i] ?? 0;
                if (owned === modelId) weight -= mix;
                if (target === modelId) weight += mix;
                if (weight <= 0) continue;
                const o = i * 4;
                pixels[o] = ((shared[o] ?? 0) * weight + 0.5) | 0;
                pixels[o + 1] = ((shared[o + 1] ?? 0) * weight + 0.5) | 0;
                pixels[o + 2] = ((shared[o + 2] ?? 0) * weight + 0.5) | 0;
                pixels[o + 3] = ((shared[o + 3] ?? 0) * weight + 0.5) | 0;
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

function materialBlend(
    modelIdAt: (tileIndex: number) => string | undefined,
    transitionTilesFor: (modelId: string) => number
): { target: (string | undefined)[]; mix: Float32Array } {
    const n = WORLD_TILES * WORLD_TILES;
    const target: (string | undefined)[] = new Array(n);
    const distance = new Float32Array(n);
    distance.fill(Number.POSITIVE_INFINITY);
    const queue: number[] = [];

    for (let ty = 0; ty < WORLD_TILES; ty++) {
        for (let tx = 0; tx < WORLD_TILES; tx++) {
            const i = ty * WORLD_TILES + tx;
            const self = modelIdAt(i);
            if (self === undefined) continue;
            for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
                const nx = tx + dx;
                const ny = ty + dy;
                if (nx < 0 || ny < 0 || nx >= WORLD_TILES || ny >= WORLD_TILES) continue;
                const other = modelIdAt(ny * WORLD_TILES + nx);
                if (other === undefined || other === self) continue;
                distance[i] = 0;
                target[i] = other;
                queue.push(i);
                break;
            }
        }
    }

    for (let qi = 0; qi < queue.length; qi++) {
        const i = queue[qi];
        if (i === undefined) continue;
        const nextDistance = (distance[i] ?? Number.POSITIVE_INFINITY) + 1;
        const self = modelIdAt(i);
        if (self === undefined || nextDistance > transitionTilesFor(self)) continue;
        const tx = i % WORLD_TILES;
        const ty = (i / WORLD_TILES) | 0;
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
            const nx = tx + dx;
            const ny = ty + dy;
            if (nx < 0 || ny < 0 || nx >= WORLD_TILES || ny >= WORLD_TILES) continue;
            const j = ny * WORLD_TILES + nx;
            if (
                modelIdAt(j) !== self ||
                nextDistance >= (distance[j] ?? Number.POSITIVE_INFINITY)
            ) {
                continue;
            }
            distance[j] = nextDistance;
            target[j] = target[i];
            queue.push(j);
        }
    }

    const mix = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const d = distance[i] ?? Number.POSITIVE_INFINITY;
        const self = modelIdAt(i);
        if (self === undefined) continue;
        const fadeTiles = transitionTilesFor(self);
        if (d >= fadeTiles) continue;
        const t = 1 - d / fadeTiles;
        mix[i] = 0.5 * t * t * (3 - 2 * t);
    }
    return { target, mix };
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
