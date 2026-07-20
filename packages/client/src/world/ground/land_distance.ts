import { TILE_SIZE, WORLD_TILES } from "@bundu/shared/tiles";
import type { GroundPatchRef } from "./shore";

const N = WORLD_TILES * WORLD_TILES;
const INF = 1e6;
const ORTHO = 1;
const DIAG = Math.SQRT2;
/** Soften iso-contours after chamfer — keep light so the hard land edge still has room. */
const SMOOTH_PASSES = 1;

/** Cap for discrete queries — enough for a 200² map. */
export const LAND_DISTANCE_MAX = 255;

/**
 * Signed tile distance + nearest land color.
 * Positive = ocean (from land), negative = into land (from ocean).
 */
export class LandDistanceField {
    private readonly dist = new Float32Array(N);
    private readonly land = new Uint8Array(N);
    /** Land RGB — self on land, nearest land on ocean. */
    private readonly color = new Uint32Array(N);
    private readonly scratch = new Float32Array(N);
    private readonly scratch2 = new Float32Array(N);
    private readonly smoothBuf = new Float32Array(N);

    /** Tiles from nearest land. `0` on land; capped at {@link LAND_DISTANCE_MAX}. */
    atTile(tx: number, ty: number): number {
        if (tx < 0 || ty < 0 || tx >= WORLD_TILES || ty >= WORLD_TILES) {
            return LAND_DISTANCE_MAX;
        }
        const d = this.dist[ty * WORLD_TILES + tx]!;
        if (d <= 0) return 0;
        return d >= LAND_DISTANCE_MAX ? LAND_DISTANCE_MAX : d;
    }

    atWorld(worldX: number, worldY: number): number {
        return this.atTile((worldX / TILE_SIZE) | 0, (worldY / TILE_SIZE) | 0);
    }

    /**
     * Tiles inland from nearest ocean (0 on/over water). Bilinear in tile space
     * so sand-band iso-lines stay smooth under fill subdiv.
     */
    inlandAt(tileX: number, tileY: number): number {
        const x0 = Math.floor(tileX);
        const y0 = Math.floor(tileY);
        const fx = tileX - x0;
        const fy = tileY - y0;
        const s00 = this.inlandSample(x0, y0);
        const s10 = this.inlandSample(x0 + 1, y0);
        const s01 = this.inlandSample(x0, y0 + 1);
        const s11 = this.inlandSample(x0 + 1, y0 + 1);
        return (
            s00 * (1 - fx) * (1 - fy) +
            s10 * fx * (1 - fy) +
            s01 * (1 - fx) * fy +
            s11 * fx * fy
        );
    }

    private inlandSample(tx: number, ty: number): number {
        const cx = Math.min(WORLD_TILES - 1, Math.max(0, tx));
        const cy = Math.min(WORLD_TILES - 1, Math.max(0, ty));
        const d = this.dist[cy * WORLD_TILES + cx]!;
        return d < 0 ? -d : 0;
    }

    rebuild(
        patches: readonly GroundPatchRef[],
        isOceanType: (type: number) => boolean,
        colorOfType: (type: number) => number
    ): void {
        const { land, dist, color, scratch, scratch2 } = this;
        land.fill(0);
        color.fill(0);

        const byBottom = [...patches].sort((a, b) => a.id - b.id);
        for (const patch of byBottom) {
            const isLand = !isOceanType(patch.type) ? 1 : 0;
            const rgb = isLand ? colorOfType(patch.type) : 0;
            const x1 = Math.max(0, patch.x);
            const y1 = Math.max(0, patch.y);
            const x2 = Math.min(WORLD_TILES, patch.x + patch.w);
            const y2 = Math.min(WORLD_TILES, patch.y + patch.h);
            for (let ty = y1; ty < y2; ty++) {
                const row = ty * WORLD_TILES;
                for (let tx = x1; tx < x2; tx++) {
                    const i = row + tx;
                    land[i] = isLand;
                    color[i] = rgb;
                }
            }
        }

        scratch.fill(INF);
        for (let i = 0; i < N; i++) {
            if (land[i]) scratch[i] = 0;
        }
        this.chamfer(scratch, /*intoOcean*/ true);
        this.smooth(scratch, /*oceanOnly*/ true);

        scratch2.fill(INF);
        for (let i = 0; i < N; i++) {
            if (!land[i]) scratch2[i] = 0;
        }
        this.chamfer(scratch2, /*intoOcean*/ false);
        this.smooth(scratch2, /*oceanOnly*/ false);

        for (let i = 0; i < N; i++) {
            if (land[i]) {
                const d = scratch2[i]!;
                dist[i] = -(d > LAND_DISTANCE_MAX ? LAND_DISTANCE_MAX : d);
            } else {
                const d = scratch[i]!;
                dist[i] = d > LAND_DISTANCE_MAX ? LAND_DISTANCE_MAX : d;
            }
        }
    }

    /**
     * Ocean fill bake:
     * - RGB blends ocean→land on the water side (within per-tile blendTiles)
     * - A stays opaque until the coastline, then fades into land (overshoot)
     */
    writeShoreRgba(
        out: Uint8Array,
        oceanColorAt: (tileIndex: number) => number,
        blendTilesAt: (tileIndex: number) => number,
        overshootTiles: number
    ): void {
        const { dist, color } = this;
        const invOver = overshootTiles > 0 ? 1 / overshootTiles : 0;

        for (let i = 0; i < N; i++) {
            const sdf = dist[i]!;
            const o = i * 4;
            const landRgb = color[i]!;
            const lr = (landRgb >> 16) & 0xff;
            const lg = (landRgb >> 8) & 0xff;
            const lb = landRgb & 0xff;
            const oceanColor = oceanColorAt(i);
            const or = (oceanColor >> 16) & 0xff;
            const og = (oceanColor >> 8) & 0xff;
            const ob = oceanColor & 0xff;
            const blendTiles = blendTilesAt(i);
            /**
             * Exact land RGB near the shore. Shrinks when fade is short so a
             * 2-tile blend still has room to mix into water color.
             */
            const landColorReach = Math.min(2, Math.max(0, blendTiles - 1));

            // Color: pure land near/over the shore; then blend out to ocean.
            if (sdf <= landColorReach) {
                out[o] = lr;
                out[o + 1] = lg;
                out[o + 2] = lb;
            } else if (sdf >= blendTiles) {
                out[o] = or;
                out[o + 1] = og;
                out[o + 2] = ob;
            } else {
                const span = blendTiles - landColorReach;
                const colorT = span > 0 ? (sdf - landColorReach) / span : 1;
                const s = colorT * colorT * (3 - 2 * colorT);
                const oceanMix = s * s;
                out[o] = (lr + (or - lr) * oceanMix + 0.5) | 0;
                out[o + 1] = (lg + (og - lg) * oceanMix + 0.5) | 0;
                out[o + 2] = (lb + (ob - lb) * oceanMix + 0.5) | 0;
            }

            // Alpha: opaque on ocean / border; fade only after crossing into land.
            if (sdf >= 0) {
                out[o + 3] = 255;
            } else if (sdf <= -overshootTiles) {
                out[o + 3] = 0;
            } else {
                const a = (sdf + overshootTiles) * invOver;
                const s = a * a * (3 - 2 * a);
                out[o + 3] = (s * 255 + 0.5) | 0;
            }
        }
    }

    private chamfer(field: Float32Array, intoOcean: boolean): void {
        const { land } = this;
        const skip = (i: number) => (intoOcean ? land[i] !== 0 : land[i] === 0);

        for (let ty = 0; ty < WORLD_TILES; ty++) {
            const row = ty * WORLD_TILES;
            for (let tx = 0; tx < WORLD_TILES; tx++) {
                const i = row + tx;
                if (skip(i)) continue;
                this.relax(field, intoOcean, i, tx - 1, ty, ORTHO);
                this.relax(field, intoOcean, i, tx, ty - 1, ORTHO);
                this.relax(field, intoOcean, i, tx - 1, ty - 1, DIAG);
                this.relax(field, intoOcean, i, tx + 1, ty - 1, DIAG);
            }
        }

        for (let ty = WORLD_TILES - 1; ty >= 0; ty--) {
            const row = ty * WORLD_TILES;
            for (let tx = WORLD_TILES - 1; tx >= 0; tx--) {
                const i = row + tx;
                if (skip(i)) continue;
                this.relax(field, intoOcean, i, tx + 1, ty, ORTHO);
                this.relax(field, intoOcean, i, tx, ty + 1, ORTHO);
                this.relax(field, intoOcean, i, tx + 1, ty + 1, DIAG);
                this.relax(field, intoOcean, i, tx - 1, ty + 1, DIAG);
            }
        }
    }

    private relax(
        field: Float32Array,
        intoOcean: boolean,
        i: number,
        nx: number,
        ny: number,
        cost: number
    ): void {
        if (nx < 0 || ny < 0 || nx >= WORLD_TILES || ny >= WORLD_TILES) return;
        const ni = ny * WORLD_TILES + nx;
        const next = field[ni]! + cost;
        if (next >= field[i]!) return;
        field[i] = next;
        if (intoOcean) this.color[i] = this.color[ni]!;
    }

    private smooth(field: Float32Array, oceanOnly: boolean): void {
        const { land, smoothBuf } = this;
        for (let pass = 0; pass < SMOOTH_PASSES; pass++) {
            for (let ty = 0; ty < WORLD_TILES; ty++) {
                const row = ty * WORLD_TILES;
                for (let tx = 0; tx < WORLD_TILES; tx++) {
                    const i = row + tx;
                    const isOcean = land[i] === 0;
                    if (oceanOnly ? !isOcean : isOcean) {
                        smoothBuf[i] = field[i]!;
                        continue;
                    }
                    let sum = 0;
                    let n = 0;
                    for (let dy = -1; dy <= 1; dy++) {
                        const iy = ty + dy;
                        if (iy < 0 || iy >= WORLD_TILES) continue;
                        const ry = iy * WORLD_TILES;
                        for (let dx = -1; dx <= 1; dx++) {
                            const ix = tx + dx;
                            if (ix < 0 || ix >= WORLD_TILES) continue;
                            sum += field[ry + ix]!;
                            n++;
                        }
                    }
                    smoothBuf[i] = sum / n;
                }
            }
            field.set(smoothBuf);
        }
    }
}

/**
 * Soften hard RGB edges where distinct water colors meet (ocean / warm / deep).
 * `fadeTiles` is the blend distance into **each** side of a water↔water
 * boundary (so 6 → up to 6 tiles of mix on both sides). Land / alpha untouched.
 */
export function softenWaterWaterEdges(
    pixels: Uint8Array,
    isWater: (tileIndex: number) => boolean,
    fadeTiles: number
): void {
    if (fadeTiles <= 0) return;
    const n = WORLD_TILES * WORLD_TILES;
    const color = new Uint32Array(n);
    const dist = new Float32Array(n);
    const target = new Uint32Array(n);
    const INF = 1e6;
    dist.fill(INF);

    for (let i = 0; i < n; i++) {
        if (!isWater(i)) continue;
        const o = i * 4;
        color[i] =
            ((pixels[o]! << 16) | (pixels[o + 1]! << 8) | pixels[o + 2]!) >>> 0;
    }

    const queue: number[] = [];
    for (let ty = 0; ty < WORLD_TILES; ty++) {
        for (let tx = 0; tx < WORLD_TILES; tx++) {
            const i = ty * WORLD_TILES + tx;
            if (!isWater(i)) continue;
            const self = color[i]!;
            let other: number | undefined;
            for (let dy = -1; dy <= 1 && other === undefined; dy++) {
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
                    if (!isWater(j)) continue;
                    const c = color[j]!;
                    if (c !== self) {
                        other = c;
                        break;
                    }
                }
            }
            if (other === undefined) continue;
            dist[i] = 0;
            target[i] = other;
            queue.push(i);
        }
    }

    let qi = 0;
    while (qi < queue.length) {
        const i = queue[qi++]!;
        const d = dist[i]!;
        if (d >= fadeTiles) continue;
        const tx = i % WORLD_TILES;
        const ty = (i / WORLD_TILES) | 0;
        const tgt = target[i]!;
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
                if (!isWater(j)) continue;
                const step = dx !== 0 && dy !== 0 ? Math.SQRT2 : 1;
                const next = d + step;
                if (next >= dist[j]! || next > fadeTiles) continue;
                dist[j] = next;
                target[j] = tgt;
                queue.push(j);
            }
        }
    }

    for (let i = 0; i < n; i++) {
        if (!isWater(i)) continue;
        const d = dist[i]!;
        if (!(d < fadeTiles)) continue;
        const o = i * 4;
        const tgt = target[i]!;
        const tr = (tgt >> 16) & 0xff;
        const tg = (tgt >> 8) & 0xff;
        const tb = tgt & 0xff;
        const t = 1 - d / fadeTiles;
        const s = t * t * (3 - 2 * t);
        // Border (d≈0) mixes halfway; fadeTiles away stays authored.
        const mix = s * 0.5;
        pixels[o] = (pixels[o]! + (tr - pixels[o]!) * mix + 0.5) | 0;
        pixels[o + 1] =
            (pixels[o + 1]! + (tg - pixels[o + 1]!) * mix + 0.5) | 0;
        pixels[o + 2] =
            (pixels[o + 2]! + (tb - pixels[o + 2]!) * mix + 0.5) | 0;
    }
}
