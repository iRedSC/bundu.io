import { BufferImageSource, Sprite, Texture, type Container } from "pixi.js";
import type { SolidGroundFill } from "@bundu/shared/ground_models";
import { TILE_SIZE, WORLD_TILES } from "@bundu/shared/tiles";
import { PLAY_MIN_ZOOM } from "../../rendering/camera";
import { shadeLandFill } from "./land_fill_shade";
import { NEARSHORE_OVERSHOOT_TILES } from "./nearshore_fill";
import type { GroundPatchRef } from "./shore";
import type { GroundViewBounds } from "./types";
import {
    boxSdf,
    coverage,
    ORGANIC_EDGE_SUBDIV,
    ORGANIC_EDGE_TEXTURE_MAX,
} from "./organic_boundary";

/** How far the organic edge can push past the authored rect (tiles). */
export const LAND_SEAM_AMPLITUDE = 1.15;
/** Extra sprite/frame padding so bulges / blobs stay visible. */
export const LAND_SEAM_PAD_TILES = Math.ceil(LAND_SEAM_AMPLITUDE + 0.02);
/**
 * Flat fill stays this far inside the authored edge so organic cuts (and
 * corner bites) never reveal the hard rect. Seam band paints the ring.
 */
export const LAND_SEAM_FILL_INSET_TILES = LAND_SEAM_PAD_TILES + 1;
/** Land chunks to bake per live tick (join flush uses its own limit). */
export const LAND_SEAM_PER_TICK = 1;
/**
 * Live play / freecam-exit: only run a bake tick every N frames.
 * Kept high so LOD upgrades and ground edits drip in without hitching;
 * initial load bypasses this via `flushLandSeams` (nearby only).
 */
export const LAND_SEAM_TICK_INTERVAL = 18;

/**
 * Max tile edge of one seam chunk. Keeps crisp subdiv cheap:
 * 32 × 64 texels/tile = 2048 px — at the texel cap.
 */
const SEAM_CHUNK_TILES = 32;
/**
 * Bake / keep seam chunks this far past the viewport (tiles). Covers one
 * chunk past the screen so pans rarely reveal hard AABB edges.
 */
export const LAND_SEAM_KEEP_TILES = SEAM_CHUNK_TILES;
/**
 * Unload resident chunks only past this pad (tiles). Larger than keep so
 * camera jitter / short pans don't thrash bake ↔ destroy.
 */
export const LAND_SEAM_EVICT_TILES = SEAM_CHUNK_TILES * 2;
/**
 * Zoom → seam texel density. Play zooms use the top bucket; freecam stays on
 * the cheap floor. Mid bucket is only for the freecam zoom-out ramp.
 */
const LOD_SUBDIV = [8, 32, ORGANIC_EDGE_SUBDIV] as const;
export type SeamLod = 0 | 1 | 2;


export type LandSeamChunkBake = {
    /** Ground entity id. */
    id: number;
    /** Stable id for apply / unload (`patch:x0,y0,x1,y1`). */
    key: string;
    texture: Texture;
    /** World-pixel placement. */
    x: number;
    y: number;
    w: number;
    h: number;
};

export type LandSeamUnload = {
    id: number;
    key: string;
    /** Destroy after the patch sprite is unbound. */
    texture: Texture;
};

type SeamChunkJob = {
    patch: GroundPatchRef;
    /** Tile-space half-open rect. */
    x0: number;
    y0: number;
    x1: number;
    y1: number;
};

/**
 * Zoom → LOD. Any play-accessible zoom stays max (and higher-res than before).
 * Freecam forces the cheap bucket immediately and keeps it; if freecam is off
 * but zoom is somehow below play floor, mid/low buckets still apply.
 */
export function seamLodFromZoom(zoom: number, freecam = false): SeamLod {
    if (freecam) return 0;
    if (zoom < 0.4) return 0;
    if (zoom < PLAY_MIN_ZOOM) return 1;
    return 2;
}

/**
 * Edge-band seam baker: opaque fill stays an inset sprite; only the
 * land↔land ring is baked in zoom-LOD chunks, visible ones first.
 * Distant chunks stay queued / get unloaded — textures only for nearby.
 * Textured fills (sand/forest) shade here so color follows the organic edge.
 */
export class LandSeamBaker {
    private topLand = new Uint8Array(WORLD_TILES * WORLD_TILES);
    private oceanDist = new Float32Array(WORLD_TILES * WORLD_TILES);
    private landPatches: GroundPatchRef[] = [];
    private queue: SeamChunkJob[] = [];
    private colorOfType: (type: number) => number = () => 0;
    private fillOfType: (type: number) => SolidGroundFill | undefined = () =>
        undefined;
    private inlandAt: (tileX: number, tileY: number) => number = () => 0;
    private readonly textures = new Map<string, Texture>();
    /** Jobs currently resident as GPU textures (keyed like {@link textures}). */
    private readonly resident = new Map<string, SeamChunkJob>();
    private total = 0;
    private done = 0;
    private lod: SeamLod = 2;

    /** Reallocate tile buffers after {@link setWorldTiles}. */
    resizeForWorld(): void {
        const n = WORLD_TILES * WORLD_TILES;
        if (this.topLand.length === n) return;
        this.reset();
        this.topLand = new Uint8Array(n);
        this.oceanDist = new Float32Array(n);
    }

    /**
     * Build land occupancy + chunk queue from patches.
     * Omit surface-layer water (ponds) so they don't clear land under themselves —
     * land↔land seams then continue underneath while the pond still draws above.
     */
    prepare(
        patches: readonly GroundPatchRef[],
        isOceanType: (type: number) => boolean,
        colorOfType: (type: number) => number,
        lod: SeamLod = this.lod,
        fillOfType?: (type: number) => SolidGroundFill | undefined,
        inlandAt?: (tileX: number, tileY: number) => number
    ): void {
        this.lod = lod;
        this.colorOfType = colorOfType;
        this.fillOfType = fillOfType ?? (() => undefined);
        this.inlandAt = inlandAt ?? (() => 0);
        this.destroyTextures();
        this.topLand.fill(0);
        this.landPatches = [];

        const byBottom = [...patches].sort((a, b) => a.id - b.id);
        for (const patch of byBottom) {
            const x1 = Math.max(0, patch.x);
            const y1 = Math.max(0, patch.y);
            const x2 = Math.min(WORLD_TILES, patch.x + patch.w);
            const y2 = Math.min(WORLD_TILES, patch.y + patch.h);
            const land = isOceanType(patch.type) ? 0 : 1;
            for (let ty = y1; ty < y2; ty++) {
                const row = ty * WORLD_TILES;
                for (let tx = x1; tx < x2; tx++) {
                    this.topLand[row + tx] = land;
                }
            }
            if (land) this.landPatches.push(patch);
        }
        fillOceanDistance(this.topLand, this.oceanDist);
        this.rebuildQueue();
    }

    /** Change zoom LOD; returns true when callers must clear applied seam sprites. */
    setLod(lod: SeamLod): boolean {
        if (lod === this.lod) return false;
        this.lod = lod;
        this.destroyTextures();
        if (this.landPatches.length > 0) this.rebuildQueue();
        return true;
    }

    getLod(): SeamLod {
        return this.lod;
    }

    /** Drop textures + queue (world clear / soft reconnect). */
    reset(): void {
        this.destroyTextures();
        this.queue = [];
        this.landPatches = [];
        this.total = 0;
        this.done = 0;
        this.topLand.fill(0);
        this.oceanDist.fill(0);
    }

    /**
     * Bake up to `limit` chunks. When `view` is set, prefer chunks near the
     * viewport and skip anything outside the keep ring (stream-in only).
     */
    tick(
        limit = LAND_SEAM_PER_TICK,
        view?: GroundViewBounds
    ): LandSeamChunkBake[] {
        const out: LandSeamChunkBake[] = [];
        const keepPad = LAND_SEAM_KEEP_TILES * TILE_SIZE;
        while (limit > 0 && this.queue.length > 0) {
            const index = view
                ? pickNearbyJob(this.queue, view, keepPad)
                : 0;
            if (index < 0) break;
            const [job] = this.queue.splice(index, 1);
            if (!job) break;
            const baked = this.bakeChunk(job);
            const key = chunkKey(job);
            this.textures.set(key, baked.texture);
            this.resident.set(key, job);
            out.push(baked);
            this.done = this.textures.size;
            limit--;
        }
        return out;
    }

    /**
     * Drop resident chunks outside the evict ring and re-queue those jobs.
     * Caller must unbind sprites, then destroy each returned texture.
     */
    unloadDistant(view: GroundViewBounds): LandSeamUnload[] {
        const evictPad = LAND_SEAM_EVICT_TILES * TILE_SIZE;
        const out: LandSeamUnload[] = [];
        for (const [key, job] of [...this.resident]) {
            if (jobIntersectsView(job, view, evictPad)) continue;
            const texture = this.textures.get(key);
            if (!texture) continue;
            this.textures.delete(key);
            this.resident.delete(key);
            this.queue.push(job);
            out.push({ id: job.patch.id, key, texture });
        }
        if (out.length > 0) this.done = this.textures.size;
        return out;
    }

    /** Queued chunks that intersect the keep ring around `view`. */
    nearbyPending(view: GroundViewBounds): number {
        const keepPad = LAND_SEAM_KEEP_TILES * TILE_SIZE;
        let n = 0;
        for (const job of this.queue) {
            if (jobIntersectsView(job, view, keepPad)) n++;
        }
        return n;
    }

    /**
     * Nearby bake progress: resident-in-keep + pending-in-keep.
     * Used by the join loading bar (world-wide pending stays high on purpose).
     */
    nearbyProgress(view: GroundViewBounds): {
        done: number;
        total: number;
        pending: number;
    } {
        const keepPad = LAND_SEAM_KEEP_TILES * TILE_SIZE;
        let done = 0;
        for (const job of this.resident.values()) {
            if (jobIntersectsView(job, view, keepPad)) done++;
        }
        const pending = this.nearbyPending(view);
        return { done, total: done + pending, pending };
    }

    get pending(): number {
        return this.queue.length;
    }

    get progress(): { done: number; total: number } {
        return { done: this.done, total: this.total };
    }

    private rebuildQueue(): void {
        this.queue = [];
        for (const patch of this.landPatches) {
            for (const rect of edgeChunkRects(patch)) {
                this.queue.push({ patch, ...rect });
            }
        }
        // Small chunks first so coasts appear quickly when view is unknown.
        this.queue.sort(
            (a, b) =>
                (a.x1 - a.x0) * (a.y1 - a.y0) - (b.x1 - b.x0) * (b.y1 - b.y0)
        );
        this.total = this.queue.length;
        this.done = 0;
    }

    private destroyTextures(): void {
        for (const tex of this.textures.values()) tex.destroy(true);
        this.textures.clear();
        this.resident.clear();
    }

    private bakeChunk(job: SeamChunkJob): LandSeamChunkBake {
        const { topLand, oceanDist, lod } = this;
        const { patch, x0, y0, x1, y1 } = job;
        const pad = LAND_SEAM_PAD_TILES;
        const fillInset = LAND_SEAM_FILL_INSET_TILES;
        const rgb = this.colorOfType(patch.type);
        const fill = this.fillOfType(patch.type);
        // Flat lands leave the nearshore overshoot band clear so shore color owns
        // it. Textured fills must paint that strip or a hard seam appears ~2.5
        // tiles inland where flat nearshore meets textured land.
        const coastClear = fill ? 0 : NEARSHORE_OVERSHOOT_TILES;
        const lr = (rgb >> 16) & 0xff;
        const lg = (rgb >> 8) & 0xff;
        const lb = rgb & 0xff;

        const tileW = Math.max(1e-6, x1 - x0);
        const tileH = Math.max(1e-6, y1 - y0);
        const subdiv = seamSubdiv(tileW, tileH, lod);
        const aa = 0.5 / subdiv;
        const tw = Math.max(1, Math.ceil(tileW * subdiv));
        const th = Math.max(1, Math.ceil(tileH * subdiv));
        const pixels = new Uint8Array(tw * th * 4);

        for (let sy = 0; sy < th; sy++) {
            const row = sy * tw;
            const py = y0 + (sy + 0.5) / subdiv;
            const ty = Math.min(WORLD_TILES - 1, Math.max(0, py | 0));
            for (let sx = 0; sx < tw; sx++) {
                const px = x0 + (sx + 0.5) / subdiv;
                const tx = Math.min(WORLD_TILES - 1, Math.max(0, px | 0));
                if (tx < 0 || ty < 0 || tx >= WORLD_TILES || ty >= WORLD_TILES) {
                    continue;
                }
                const tile = ty * WORLD_TILES + tx;
                if ((oceanDist[tile] ?? 0) <= coastClear) continue;

                const sdf = boxSdf(
                    px,
                    py,
                    patch.x,
                    patch.y,
                    patch.w,
                    patch.h
                );
                // Deep interior is the inset fill — leave transparent. Overlap
                // 1 tile into the inset so clamp-to-edge at the fill rim doesn't
                // show as a hard AABB seam through sand_bands.
                const tiny =
                    patch.w <= fillInset * 2 || patch.h <= fillInset * 2;
                if (sdf <= -(fillInset + 1)) {
                    if (!tiny) continue;
                    const [tr, tg, tb] = shadeLandFill(
                        lr,
                        lg,
                        lb,
                        fill,
                        px,
                        py,
                        this.inlandAt(px, py)
                    );
                    writeLand(pixels, row + sx, tr, tg, tb, 1);
                    continue;
                }
                if (sdf >= pad) continue;

                const authLand = topLand[tile] !== 0;
                if (sdf > 0 && !authLand) continue;

                const landLand = facesLandLand(tx, ty, patch, topLand);
                let edge = sdf;
                if (landLand && Math.abs(sdf) <= LAND_SEAM_AMPLITUDE + aa) {
                    edge = sdf - seamOffset(px, py);
                }
                const cover = coverage(edge, aa);
                if (cover <= 0) continue;
                const [r, g, b] = shadeLandFill(
                    lr,
                    lg,
                    lb,
                    fill,
                    px,
                    py,
                    this.inlandAt(px, py)
                );
                writeLand(pixels, row + sx, r, g, b, cover);
            }
        }

        const source = new BufferImageSource({
            width: tw,
            height: th,
            format: "rgba8unorm",
            scaleMode: "linear",
            addressMode: "clamp-to-edge",
            alphaMode: "premultiplied-alpha",
            resource: pixels,
        });
        return {
            id: patch.id,
            key: chunkKey(job),
            texture: new Texture({ source }),
            x: x0 * TILE_SIZE,
            y: y0 * TILE_SIZE,
            w: tileW * TILE_SIZE,
            h: tileH * TILE_SIZE,
        };
    }
}

function chunkKey(job: SeamChunkJob): string {
    return `${job.patch.id}:${job.x0},${job.y0},${job.x1},${job.y1}`;
}

/** Edge-band (or full padded rect for tiny patches), split into chunks. */
function edgeChunkRects(
    patch: GroundPatchRef
): Array<{ x0: number; y0: number; x1: number; y1: number }> {
    const pad = LAND_SEAM_PAD_TILES;
    const inset = LAND_SEAM_FILL_INSET_TILES;
    // Bake 1 tile past the fill rim so the seam layer covers the join.
    const band = inset + 1;
    const x0 = patch.x - pad;
    const y0 = patch.y - pad;
    const x1 = patch.x + patch.w + pad;
    const y1 = patch.y + patch.h + pad;

    if (patch.w <= inset * 2 || patch.h <= inset * 2) {
        return chunkRect(x0, y0, x1, y1);
    }

    return [
        ...chunkRect(x0, y0, x1, patch.y + band),
        ...chunkRect(x0, patch.y + patch.h - band, x1, y1),
        ...chunkRect(x0, patch.y + band, patch.x + band, patch.y + patch.h - band),
        ...chunkRect(
            patch.x + patch.w - band,
            patch.y + band,
            x1,
            patch.y + patch.h - band
        ),
    ];
}

function chunkRect(
    x0: number,
    y0: number,
    x1: number,
    y1: number
): Array<{ x0: number; y0: number; x1: number; y1: number }> {
    const out: Array<{ x0: number; y0: number; x1: number; y1: number }> = [];
    if (x1 <= x0 || y1 <= y0) return out;
    for (let y = y0; y < y1; y += SEAM_CHUNK_TILES) {
        for (let x = x0; x < x1; x += SEAM_CHUNK_TILES) {
            out.push({
                x0: x,
                y0: y,
                x1: Math.min(x1, x + SEAM_CHUNK_TILES),
                y1: Math.min(y1, y + SEAM_CHUNK_TILES),
            });
        }
    }
    return out;
}

function pickNearbyJob(
    queue: readonly SeamChunkJob[],
    view: GroundViewBounds,
    keepPadPx: number
): number {
    const cx = (view.minX + view.maxX) * 0.5;
    const cy = (view.minY + view.maxY) * 0.5;
    const visPad = LAND_SEAM_PAD_TILES * TILE_SIZE;
    const minX = view.minX - visPad;
    const minY = view.minY - visPad;
    const maxX = view.maxX + visPad;
    const maxY = view.maxY + visPad;

    let best = -1;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let i = 0; i < queue.length; i++) {
        const job = queue[i];
        if (!job || !jobIntersectsView(job, view, keepPadPx)) continue;
        const jx0 = job.x0 * TILE_SIZE;
        const jy0 = job.y0 * TILE_SIZE;
        const jx1 = job.x1 * TILE_SIZE;
        const jy1 = job.y1 * TILE_SIZE;
        const visible =
            jx1 >= minX && jx0 <= maxX && jy1 >= minY && jy0 <= maxY;
        const mx = (jx0 + jx1) * 0.5;
        const my = (jy0 + jy1) * 0.5;
        const dist = (mx - cx) * (mx - cx) + (my - cy) * (my - cy);
        // On-screen first, then nearest center within the keep ring.
        const score = visible ? dist : 1e15 + dist;
        if (score < bestScore) {
            bestScore = score;
            best = i;
        }
    }
    return best;
}

function jobIntersectsView(
    job: SeamChunkJob,
    view: GroundViewBounds,
    padPx: number
): boolean {
    const jx0 = job.x0 * TILE_SIZE;
    const jy0 = job.y0 * TILE_SIZE;
    const jx1 = job.x1 * TILE_SIZE;
    const jy1 = job.y1 * TILE_SIZE;
    return (
        jx1 >= view.minX - padPx &&
        jx0 <= view.maxX + padPx &&
        jy1 >= view.minY - padPx &&
        jy0 <= view.maxY + padPx
    );
}

function writeLand(
    pixels: Uint8Array,
    texIndex: number,
    lr: number,
    lg: number,
    lb: number,
    cover: number
): void {
    const o = texIndex * 4;
    const pa = pixels[o + 3] ?? 0;
    if (pa === 0) {
        pixels[o] = (lr * cover + 0.5) | 0;
        pixels[o + 1] = (lg * cover + 0.5) | 0;
        pixels[o + 2] = (lb * cover + 0.5) | 0;
        pixels[o + 3] = (cover * 255 + 0.5) | 0;
        return;
    }
    const m = cover;
    const pr = pixels[o] ?? 0;
    const pg = pixels[o + 1] ?? 0;
    const pb = pixels[o + 2] ?? 0;
    pixels[o] = (pr * (1 - m) + lr * m + 0.5) | 0;
    pixels[o + 1] = (pg * (1 - m) + lg * m + 0.5) | 0;
    pixels[o + 2] = (pb * (1 - m) + lb * m + 0.5) | 0;
    pixels[o + 3] = 255;
}

function seamSubdiv(tileW: number, tileH: number, lod: SeamLod): number {
    const target = LOD_SUBDIV[lod];
    const maxEdge = Math.max(tileW, tileH, 1);
    const capped = Math.max(
        1,
        Math.floor(ORGANIC_EDGE_TEXTURE_MAX / maxEdge)
    );
    return Math.max(1, Math.min(target, capped));
}

function fillOceanDistance(topLand: Uint8Array, out: Float32Array): void {
    const INF = 1e6;
    out.fill(INF);
    const n = WORLD_TILES * WORLD_TILES;
    for (let i = 0; i < n; i++) {
        if (!topLand[i]) out[i] = 0;
    }
    for (let ty = 0; ty < WORLD_TILES; ty++) {
        const row = ty * WORLD_TILES;
        for (let tx = 0; tx < WORLD_TILES; tx++) {
            const i = row + tx;
            if (!topLand[i]) continue;
            let d = out[i] ?? INF;
            if (tx > 0) d = Math.min(d, (out[i - 1] ?? INF) + 1);
            if (ty > 0) d = Math.min(d, (out[i - WORLD_TILES] ?? INF) + 1);
            out[i] = d;
        }
    }
    for (let ty = WORLD_TILES - 1; ty >= 0; ty--) {
        const row = ty * WORLD_TILES;
        for (let tx = WORLD_TILES - 1; tx >= 0; tx--) {
            const i = row + tx;
            if (!topLand[i]) continue;
            let d = out[i] ?? INF;
            if (tx + 1 < WORLD_TILES) d = Math.min(d, (out[i + 1] ?? INF) + 1);
            if (ty + 1 < WORLD_TILES) {
                d = Math.min(d, (out[i + WORLD_TILES] ?? INF) + 1);
            }
            out[i] = d;
        }
    }
}

export function seamOffset(px: number, py: number): number {
    const wx =
        px +
        0.9 * Math.sin(0.45 * py + 0.2 * px + 0.6) +
        0.5 * Math.sin(1.0 * px - 0.62 * py + 2.1) +
        0.22 * Math.sin(1.7 * py + 0.85 * px + 3.4);
    const wy =
        py +
        0.9 * Math.sin(0.4 * px - 0.26 * py + 1.9) +
        0.5 * Math.sin(0.92 * py + 0.68 * px + 0.4) +
        0.22 * Math.sin(1.55 * px - 1.1 * py + 5.0);
    return (
        LAND_SEAM_AMPLITUDE *
        (0.22 * Math.sin(1.6 * wx + 0.7 * wy) +
            0.17 * Math.sin(1.0 * wx - 1.4 * wy + 1.4) +
            0.14 * Math.sin(2.6 * wx + 1.2 * wy + 2.7) +
            0.12 * Math.sin(0.68 * (wx + wy) + 0.8) +
            0.1 * Math.sin(3.5 * wx - 2.1 * wy + 3.9) +
            0.08 * Math.sin(2.0 * (wx - wy) + 5.1) +
            0.07 * Math.sin(4.7 * wy + 1.15 * wx + 1.2) +
            0.05 * Math.sin(3.0 * wx + 3.3 * wy + 4.4) +
            0.03 * Math.sin(5.4 * (wx + 0.5 * wy) + 0.3) +
            0.02 * Math.sin(6.2 * wy - 3.8 * wx + 2.5))
    );
}

/**
 * Pond edge: a bit more chaotic than a soft ellipse, but mid-freq only —
 * high-freq speckles spawn disconnected blobs outside the authored rect.
 */
export const POND_SEAM_AMPLITUDE = LAND_SEAM_AMPLITUDE * 0.88;

export function seamOffsetPond(px: number, py: number): number {
    const wx = px + 0.7 * Math.sin(0.38 * py + 0.22 * px + 0.4);
    const wy = py + 0.7 * Math.sin(0.34 * px - 0.28 * py + 1.3);
    return (
        POND_SEAM_AMPLITUDE *
        (0.32 * Math.sin(1.15 * wx + 0.6 * wy) +
            0.24 * Math.sin(0.82 * wx - 1.05 * wy + 1.5) +
            0.18 * Math.sin(1.55 * (wx + wy) + 2.3) +
            0.14 * Math.sin(0.55 * wx + 1.25 * wy + 0.9) +
            0.12 * Math.sin(2.05 * wx - 1.35 * wy + 3.1))
    );
}

/**
 * True when this edge faces another land tile — apply organic wobble.
 * Open ocean stays a hard box edge. Surface water is omitted from topLand so
 * land↔land seams continue under ponds (ponds own their own organic clip).
 */
export function facesLandLand(
    tx: number,
    ty: number,
    patch: GroundPatchRef,
    topLand: Uint8Array
): boolean {
    const inside =
        tx >= patch.x &&
        ty >= patch.y &&
        tx < patch.x + patch.w &&
        ty < patch.y + patch.h;

    const checks: Array<[number, number]> = [];
    if (inside) {
        if (tx === patch.x) checks.push([tx - 1, ty]);
        if (tx === patch.x + patch.w - 1) checks.push([tx + 1, ty]);
        if (ty === patch.y) checks.push([tx, ty - 1]);
        if (ty === patch.y + patch.h - 1) checks.push([tx, ty + 1]);
        if (checks.length === 0) {
            const dl = tx - patch.x;
            const dr = patch.x + patch.w - 1 - tx;
            const dt = ty - patch.y;
            const db = patch.y + patch.h - 1 - ty;
            const m = Math.min(dl, dr, dt, db);
            if (m > LAND_SEAM_FILL_INSET_TILES + 1) return false;
            if (m === dl) checks.push([patch.x - 1, ty]);
            if (m === dr) checks.push([patch.x + patch.w, ty]);
            if (m === dt) checks.push([tx, patch.y - 1]);
            if (m === db) checks.push([tx, patch.y + patch.h]);
        }
    } else {
        if (!topLand[ty * WORLD_TILES + tx]) return false;
        return true;
    }

    for (const [sx, sy] of checks) {
        if (sx < 0 || sy < 0 || sx >= WORLD_TILES || sy >= WORLD_TILES) {
            return false;
        }
        if (!topLand[sy * WORLD_TILES + sx]) return false;
    }
    return checks.length > 0;
}

/** Append one baked edge chunk onto a seam overlay layer. */
export function addLandSeamChunk(
    layer: Container,
    chunk: LandSeamChunkBake
): Sprite {
    const sprite = new Sprite(chunk.texture);
    sprite.position.set(chunk.x, chunk.y);
    sprite.width = chunk.w;
    sprite.height = chunk.h;
    layer.addChild(sprite);
    return sprite;
}

/** Drop seam overlays (safe before texture destroy). */
export function clearLandSeamLayer(layer: Container): void {
    layer.removeChildren().forEach((child) => child.destroy());
}
