import { BufferImageSource, Texture } from "pixi.js";
import { WORLD_TILES } from "@bundu/shared/tiles";

/**
 * World-tile GPU fields for organic ground shaders.
 * Rebuilt on ground sync — cheap vs former per-chunk seam rasters.
 *
 * - landOcc: 1 = solid land (ponds omitted so land↔land continues under them)
 * - inland: R = tiles inland from any water (sand fade); G = inland from
 *   open ocean only (flat coast clear — ponds must not punch beach holes)
 * - pondDist: signed distance to pond water (positive outside)
 */

/** Inland tiles encoded into 0–1 texture (shader multiplies back). */
export const INLAND_SAMPLE_SCALE = 16;
/** Pond SDF clamp (tiles) before encoding to 0–1. */
export const POND_DIST_SAMPLE_SCALE = 8;

export class GroundFieldTextures {
    private landRgba = new Uint8Array(0);
    private inlandRgba = new Uint8Array(0);
    private pondRgba = new Uint8Array(0);
    private landSource: BufferImageSource;
    private inlandSource: BufferImageSource;
    private pondSource: BufferImageSource;
    readonly landOcc: Texture;
    readonly inland: Texture;
    readonly pondDist: Texture;

    constructor() {
        this.landSource = blankSource(1, undefined, "nearest");
        this.inlandSource = blankSource(1, undefined, "linear");
        this.pondSource = blankSource(1, undefined, "linear");
        this.landOcc = new Texture({ source: this.landSource });
        this.inland = new Texture({ source: this.inlandSource });
        this.pondDist = new Texture({ source: this.pondSource });
        this.resizeForWorld();
    }

    resizeForWorld(): void {
        const n = WORLD_TILES * WORLD_TILES * 4;
        if (this.landRgba.length === n) return;
        this.landRgba = new Uint8Array(n);
        this.inlandRgba = new Uint8Array(n);
        this.pondRgba = new Uint8Array(n);
        const prevLand = this.landSource;
        const prevInland = this.inlandSource;
        const prevPond = this.pondSource;
        this.landSource = blankSource(WORLD_TILES, this.landRgba, "nearest");
        this.inlandSource = blankSource(WORLD_TILES, this.inlandRgba, "linear");
        this.pondSource = blankSource(WORLD_TILES, this.pondRgba, "linear");
        this.landOcc.source = this.landSource;
        this.inland.source = this.inlandSource;
        this.pondDist.source = this.pondSource;
        prevLand.destroy();
        prevInland.destroy();
        prevPond.destroy();
    }

    /**
     * @param land — 1 where solid land occupies the tile
     * @param inlandAt — tiles inland from any water (0 on water)
     * @param openInlandAt — tiles inland from open ocean only (ponds ignored)
     * @param pond — 1 where surface-layer water occupies the tile
     */
    rebuild(
        land: Uint8Array,
        inlandAt: (tileIndex: number) => number,
        openInlandAt: (tileIndex: number) => number,
        pond: Uint8Array
    ): void {
        this.resizeForWorld();
        const cells = WORLD_TILES * WORLD_TILES;
        for (let i = 0; i < cells; i++) {
            writeR(this.landRgba, i, land[i] ? 255 : 0);
            const inland = inlandAt(i);
            const openInland = openInlandAt(i);
            const o = i * 4;
            this.inlandRgba[o] = encodeInland(inland);
            this.inlandRgba[o + 1] = encodeInland(openInland);
            this.inlandRgba[o + 2] = 0;
            this.inlandRgba[o + 3] = 255;
        }
        writePondDistance(pond, this.pondRgba);
        this.landSource.update();
        this.inlandSource.update();
        this.pondSource.update();
    }

    destroy(): void {
        this.landOcc.destroy(true);
        this.inland.destroy(true);
        this.pondDist.destroy(true);
    }
}

function encodeInland(inland: number): number {
    return Math.min(
        255,
        Math.max(0, ((inland / INLAND_SAMPLE_SCALE) * 255 + 0.5) | 0)
    );
}

function writeR(rgba: Uint8Array, tileIndex: number, value: number): void {
    const o = tileIndex * 4;
    rgba[o] = value;
    rgba[o + 1] = value;
    rgba[o + 2] = value;
    rgba[o + 3] = 255;
}

function blankSource(
    tiles: number,
    resource?: Uint8Array,
    scaleMode: "nearest" | "linear" = "linear"
): BufferImageSource {
    const rgba = resource ?? new Uint8Array(tiles * tiles * 4);
    if (!resource) rgba.fill(0);
    return new BufferImageSource({
        width: tiles,
        height: tiles,
        format: "rgba8unorm",
        scaleMode,
        addressMode: "clamp-to-edge",
        alphaMode: "no-premultiply-alpha",
        resource: rgba,
    });
}

function writePondDistance(pond: Uint8Array, outRgba: Uint8Array): void {
    const toOutside = chamfer(pond, 1);
    const toInside = chamfer(pond, 0);
    const cells = WORLD_TILES * WORLD_TILES;
    for (let i = 0; i < cells; i++) {
        const d = pond[i]
            ? -Math.max(0, (toInside[i] ?? 0) - 0.5)
            : Math.max(0, (toOutside[i] ?? 0) - 0.5);
        const clamped = Math.max(
            -POND_DIST_SAMPLE_SCALE,
            Math.min(POND_DIST_SAMPLE_SCALE, d)
        );
        const encoded =
            (((clamped / POND_DIST_SAMPLE_SCALE) * 0.5 + 0.5) * 255 + 0.5) | 0;
        writeR(outRgba, i, encoded);
    }
}

/**
 * Tiles inland from open ocean only. Land and ponds are both "not open ocean",
 * matching the old seam baker's topLand occupancy for coast clear.
 */
export function openOceanInlandField(
    land: Uint8Array,
    openOcean: Uint8Array
): Float32Array {
    const blocked = new Uint8Array(land.length);
    for (let i = 0; i < land.length; i++) {
        // Seed distance on open ocean tiles; propagate into everything else.
        blocked[i] = openOcean[i] ? 0 : 1;
    }
    const dist = chamfer(blocked, 0);
    const out = new Float32Array(land.length);
    for (let i = 0; i < land.length; i++) {
        if (openOcean[i]) {
            out[i] = 0;
            continue;
        }
        out[i] = Math.min(INLAND_SAMPLE_SCALE, Math.max(0, (dist[i] ?? 0) - 0.5));
    }
    return out;
}

function chamfer(mask: Uint8Array, seed: 0 | 1): Float32Array {
    const w = WORLD_TILES;
    const h = WORLD_TILES;
    const distance = new Float32Array(mask.length);
    distance.fill(Number.POSITIVE_INFINITY);
    for (let i = 0; i < mask.length; i++) {
        if (mask[i] === seed) distance[i] = 0;
    }
    const diagonal = Math.SQRT2;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = y * w + x;
            let value = distance[i] ?? Number.POSITIVE_INFINITY;
            if (x > 0) value = Math.min(value, (distance[i - 1] ?? value) + 1);
            if (y > 0) value = Math.min(value, (distance[i - w] ?? value) + 1);
            if (x > 0 && y > 0) {
                value = Math.min(
                    value,
                    (distance[i - w - 1] ?? value) + diagonal
                );
            }
            if (x + 1 < w && y > 0) {
                value = Math.min(
                    value,
                    (distance[i - w + 1] ?? value) + diagonal
                );
            }
            distance[i] = value;
        }
    }
    for (let y = h - 1; y >= 0; y--) {
        for (let x = w - 1; x >= 0; x--) {
            const i = y * w + x;
            let value = distance[i] ?? Number.POSITIVE_INFINITY;
            if (x + 1 < w) {
                value = Math.min(value, (distance[i + 1] ?? value) + 1);
            }
            if (y + 1 < h) {
                value = Math.min(value, (distance[i + w] ?? value) + 1);
            }
            if (x + 1 < w && y + 1 < h) {
                value = Math.min(
                    value,
                    (distance[i + w + 1] ?? value) + diagonal
                );
            }
            if (x > 0 && y + 1 < h) {
                value = Math.min(
                    value,
                    (distance[i + w - 1] ?? value) + diagonal
                );
            }
            distance[i] = value;
        }
    }
    return distance;
}
