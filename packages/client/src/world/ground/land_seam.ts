import {
    BufferImageSource,
    type Rectangle,
    type Sprite,
    Texture,
} from "pixi.js";
import { TILE_SIZE, WORLD_TILES } from "@bundu/shared/tiles";
import { NEARSHORE_OVERSHOOT_TILES } from "./nearshore_fill";
import type { GroundPatchRef } from "./shore";

/** How far the organic edge can push past the authored rect (tiles). */
export const LAND_SEAM_AMPLITUDE = 1.15;
/** Per-patch bake texels per tile — sharp; cheap because each patch is small. */
const SEAM_SUBDIV = 48;
/** ~1 texel analytic AA (tiles). */
const SEAM_AA = 0.5 / SEAM_SUBDIV;
/** Extra sprite/frame padding so bulges / blobs stay visible. */
export const LAND_SEAM_PAD_TILES = Math.ceil(LAND_SEAM_AMPLITUDE + SEAM_AA + 0.01);
/** Land patches to bake per live tick (keep at 1 — bakes are heavy). */
export const LAND_SEAM_PER_TICK = 1;
/** Live play: only run a bake tick every N frames to avoid hitching. */
export const LAND_SEAM_TICK_INTERVAL = 3;

const TILE_N = WORLD_TILES * WORLD_TILES;

export type LandSeamBakeResult = {
    id: number;
    texture: Texture;
};

/**
 * Per-patch land↔land seam baker. Shared world fields rebuild once, then each
 * land rect gets its own high-res texture over a few frames.
 */
export class LandSeamBaker {
    private readonly topLand = new Uint8Array(TILE_N);
    private readonly oceanDist = new Float32Array(TILE_N);
    private queue: GroundPatchRef[] = [];
    private colorOfType: (type: number) => number = () => 0;
    private readonly textures = new Map<number, Texture>();
    private total = 0;
    private done = 0;

    prepare(
        patches: readonly GroundPatchRef[],
        isOceanType: (type: number) => boolean,
        colorOfType: (type: number) => number
    ): void {
        this.colorOfType = colorOfType;
        this.queue = [];
        for (const tex of this.textures.values()) tex.destroy(true);
        this.textures.clear();

        this.topLand.fill(0);
        const byBottom = [...patches].sort((a, b) => a.id - b.id);
        for (const patch of byBottom) {
            if (isOceanType(patch.type)) continue;
            const x1 = Math.max(0, patch.x);
            const y1 = Math.max(0, patch.y);
            const x2 = Math.min(WORLD_TILES, patch.x + patch.w);
            const y2 = Math.min(WORLD_TILES, patch.y + patch.h);
            for (let ty = y1; ty < y2; ty++) {
                const row = ty * WORLD_TILES;
                for (let tx = x1; tx < x2; tx++) {
                    this.topLand[row + tx] = 1;
                }
            }
            this.queue.push(patch);
        }
        // Small patches first — seams appear sooner, less hitch per tick.
        this.queue.sort((a, b) => a.w * a.h - b.w * b.h);
        this.total = this.queue.length;
        this.done = 0;
        fillOceanDistance(this.topLand, this.oceanDist);
    }

    /** Bake up to `limit` queued patches. */
    tick(limit = LAND_SEAM_PER_TICK): LandSeamBakeResult[] {
        const out: LandSeamBakeResult[] = [];
        while (limit > 0 && this.queue.length > 0) {
            const patch = this.queue.shift();
            if (!patch) break;
            const texture = this.bakePatch(patch);
            this.textures.set(patch.id, texture);
            out.push({ id: patch.id, texture });
            this.done++;
            limit--;
        }
        return out;
    }

    get pending(): number {
        return this.queue.length;
    }

    get progress(): { done: number; total: number } {
        return { done: this.done, total: this.total };
    }

    private bakePatch(patch: GroundPatchRef): Texture {
        const { topLand, oceanDist } = this;
        const pad = LAND_SEAM_PAD_TILES;
        const coastClear = NEARSHORE_OVERSHOOT_TILES;
        const rgb = this.colorOfType(patch.type);
        const lr = (rgb >> 16) & 0xff;
        const lg = (rgb >> 8) & 0xff;
        const lb = rgb & 0xff;

        const x0 = patch.x - pad;
        const y0 = patch.y - pad;
        const tw = (patch.w + pad * 2) * SEAM_SUBDIV;
        const th = (patch.h + pad * 2) * SEAM_SUBDIV;
        const pixels = new Uint8Array(tw * th * 4);

        for (let sy = 0; sy < th; sy++) {
            const row = sy * tw;
            const py = y0 + (sy + 0.5) / SEAM_SUBDIV;
            const ty = Math.min(
                WORLD_TILES - 1,
                Math.max(0, (py | 0))
            );
            for (let sx = 0; sx < tw; sx++) {
                const px = x0 + (sx + 0.5) / SEAM_SUBDIV;
                const tx = Math.min(
                    WORLD_TILES - 1,
                    Math.max(0, (px | 0))
                );
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
                if (sdf <= -pad) {
                    writeOpaque(pixels, row + sx, lr, lg, lb);
                    continue;
                }
                if (sdf >= pad) continue;

                const authLand = topLand[tile] !== 0;
                if (sdf > 0 && !authLand) continue;

                const landLand = facesLandLand(tx, ty, patch, topLand);
                let edge = sdf;
                if (
                    landLand &&
                    Math.abs(sdf) <= LAND_SEAM_AMPLITUDE + SEAM_AA
                ) {
                    edge = sdf - seamOffset(px, py);
                }
                const cover = coverage(edge);
                if (cover <= 0) continue;
                writeLand(pixels, row + sx, lr, lg, lb, cover);
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
        return new Texture({ source });
    }
}

function writeOpaque(
    pixels: Uint8Array,
    texIndex: number,
    lr: number,
    lg: number,
    lb: number
): void {
    const o = texIndex * 4;
    pixels[o] = lr;
    pixels[o + 1] = lg;
    pixels[o + 2] = lb;
    pixels[o + 3] = 255;
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
        // Premultiplied soft edge — composites over lower land sprites cleanly.
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

function coverage(sdfW: number): number {
    const b = SEAM_AA;
    if (sdfW <= -b) return 1;
    if (sdfW >= b) return 0;
    const t = (sdfW + b) / (2 * b);
    const s = t * t * (3 - 2 * t);
    return 1 - s;
}

function fillOceanDistance(topLand: Uint8Array, out: Float32Array): void {
    const INF = 1e6;
    out.fill(INF);
    for (let i = 0; i < TILE_N; i++) {
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

function seamOffset(px: number, py: number): number {
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

function boxSdf(
    px: number,
    py: number,
    x: number,
    y: number,
    w: number,
    h: number
): number {
    const qx = Math.abs(px - (x + w * 0.5)) - w * 0.5;
    const qy = Math.abs(py - (y + h * 0.5)) - h * 0.5;
    const ox = Math.max(qx, 0);
    const oy = Math.max(qy, 0);
    return Math.min(Math.max(qx, qy), 0) + Math.hypot(ox, oy);
}

function facesLandLand(
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
            if (m > LAND_SEAM_PAD_TILES) return false;
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

/** Bind a per-patch seam texture onto a land sprite. */
export function bindLandSeamSprite(
    sprite: Sprite,
    bounds: Rectangle,
    map: Texture
): void {
    const pad = LAND_SEAM_PAD_TILES;
    sprite.texture = map;
    sprite.tint = 0xffffff;
    sprite.position.set(
        bounds.x - pad * TILE_SIZE,
        bounds.y - pad * TILE_SIZE
    );
    sprite.width = bounds.width + pad * 2 * TILE_SIZE;
    sprite.height = bounds.height + pad * 2 * TILE_SIZE;
}

/** Drop a seam bake and restore the flat AABB fill (safe before texture destroy). */
export function clearLandSeamSprite(
    sprite: Sprite,
    bounds: Rectangle,
    color: number
): void {
    sprite.texture = Texture.WHITE;
    sprite.tint = color;
    sprite.position.set(bounds.x, bounds.y);
    sprite.width = bounds.width;
    sprite.height = bounds.height;
}
