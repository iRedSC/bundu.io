import { BufferImageSource, Texture } from "pixi.js";

/** Normal-play density shared by land and water organic boundaries. */
export const ORGANIC_EDGE_SUBDIV = 64;
/** Maximum edge of one organic boundary texture. */
export const ORGANIC_EDGE_TEXTURE_MAX = 2048;

export type OrganicBoundaryProfile = {
    amplitude: number;
    offset(px: number, py: number): number;
};

export type OrganicRectBake = {
    texture: Texture;
    fillTexture?: Texture;
    x: number;
    y: number;
    w: number;
    h: number;
};

type Rect = { x: number; y: number; w: number; h: number };

export function coverage(sdf: number, aa: number): number {
    if (sdf <= -aa) return 1;
    if (sdf >= aa) return 0;
    const t = (sdf + aa) / (2 * aa);
    const smooth = t * t * (3 - 2 * t);
    return 1 - smooth;
}

export function boxSdf(
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

/** Shared, size-capped rasterizer for organic rectangular ground boundaries. */
export function bakeOrganicRect(
    color: number,
    bounds: Rect,
    profile: OrganicBoundaryProfile,
    targetSubdiv: number,
    maxTextureSize: number,
    clip?: { x: number; y: number; w: number; h: number },
    innerFade = 0
): OrganicRectBake {
    const pad = Math.ceil(profile.amplitude) + 1;
    const unclippedX = bounds.x - pad;
    const unclippedY = bounds.y - pad;
    const unclippedRight = bounds.x + bounds.w + pad;
    const unclippedBottom = bounds.y + bounds.h + pad;
    const x = clip ? Math.max(unclippedX, clip.x) : unclippedX;
    const y = clip ? Math.max(unclippedY, clip.y) : unclippedY;
    const right = clip
        ? Math.min(unclippedRight, clip.x + clip.w)
        : unclippedRight;
    const bottom = clip
        ? Math.min(unclippedBottom, clip.y + clip.h)
        : unclippedBottom;
    const w = Math.max(0, right - x);
    const h = Math.max(0, bottom - y);
    const maxEdge = Math.max(w, h, 1);
    const subdiv = Math.max(
        1,
        Math.min(targetSubdiv, Math.floor(maxTextureSize / maxEdge))
    );
    const aa = 0.5 / subdiv;
    const tw = Math.max(1, Math.ceil(w * subdiv));
    const th = Math.max(1, Math.ceil(h * subdiv));
    const pixels = new Uint8Array(tw * th * 4);
    const red = (color >> 16) & 0xff;
    const green = (color >> 8) & 0xff;
    const blue = color & 0xff;

    for (let sy = 0; sy < th; sy++) {
        const py = y + (sy + 0.5) / subdiv;
        for (let sx = 0; sx < tw; sx++) {
            const px = x + (sx + 0.5) / subdiv;
            const sdf = boxSdf(px, py, bounds.x, bounds.y, bounds.w, bounds.h);
            if (sdf > profile.amplitude + aa) continue;
            const offset = Math.max(
                -profile.amplitude,
                Math.min(profile.amplitude, profile.offset(px, py))
            );
            const edge = sdf - offset;
            const shapeAlpha = coverage(edge, aa);
            const fadeAlpha =
                innerFade > 0
                    ? smoothstep(Math.min(1, Math.max(0, -edge / innerFade)))
                    : 1;
            const alpha = shapeAlpha * fadeAlpha;
            if (alpha <= 0) continue;
            const o = (sy * tw + sx) * 4;
            pixels[o] = (red * alpha + 0.5) | 0;
            pixels[o + 1] = (green * alpha + 0.5) | 0;
            pixels[o + 2] = (blue * alpha + 0.5) | 0;
            pixels[o + 3] = (alpha * 255 + 0.5) | 0;
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
    return { texture: new Texture({ source }), x, y, w, h };
}

/** One alpha texture for the union of organic patches; remains a Pixi Sprite mask. */
export function bakeOrganicRectMask(
    bounds: readonly Rect[],
    profile: OrganicBoundaryProfile,
    targetSubdiv: number,
    maxTextureSize: number,
    clip: Rect,
    outerFade: number,
    color = 0xffffff,
    fillColor?: number
): OrganicRectBake | undefined {
    if (bounds.length === 0) return undefined;
    const pad = Math.ceil(profile.amplitude) + 1;
    const x = Math.max(clip.x, Math.min(...bounds.map((rect) => rect.x - pad)));
    const y = Math.max(clip.y, Math.min(...bounds.map((rect) => rect.y - pad)));
    const right = Math.min(
        clip.x + clip.w,
        Math.max(...bounds.map((rect) => rect.x + rect.w + pad))
    );
    const bottom = Math.min(
        clip.y + clip.h,
        Math.max(...bounds.map((rect) => rect.y + rect.h + pad))
    );
    const w = Math.max(0, right - x);
    const h = Math.max(0, bottom - y);
    const maxEdge = Math.max(w, h, 1);
    const subdiv = Math.max(
        1,
        Math.min(targetSubdiv, Math.floor(maxTextureSize / maxEdge))
    );
    const aa = 0.5 / subdiv;
    const tw = Math.max(1, Math.ceil(w * subdiv));
    const th = Math.max(1, Math.ceil(h * subdiv));
    const pixels = new Uint8Array(tw * th * 4);
    const fillPixels = fillColor === undefined ? undefined : new Uint8Array(pixels.length);
    const inside = new Uint8Array(tw * th);
    const occupied = new Uint8Array(
        Math.ceil(clip.w) * Math.ceil(clip.h)
    );
    const clipW = Math.ceil(clip.w);

    for (const rect of bounds) {
        const x0 = Math.max(0, Math.floor(rect.x - clip.x));
        const y0 = Math.max(0, Math.floor(rect.y - clip.y));
        const x1 = Math.min(clipW, Math.ceil(rect.x + rect.w - clip.x));
        const y1 = Math.min(
            Math.ceil(clip.h),
            Math.ceil(rect.y + rect.h - clip.y)
        );
        for (let ty = y0; ty < y1; ty++) {
            occupied.fill(1, ty * clipW + x0, ty * clipW + x1);
        }
    }

    for (let sy = 0; sy < th; sy++) {
        const ty = Math.floor(y + (sy + 0.5) / subdiv - clip.y);
        for (let sx = 0; sx < tw; sx++) {
            const tx = Math.floor(x + (sx + 0.5) / subdiv - clip.x);
            inside[sy * tw + sx] = occupied[ty * clipW + tx] ?? 0;
        }
    }

    const toWater = chamferDistance(inside, tw, th, 1);
    const toLand = chamferDistance(inside, tw, th, 0);
    const red = (color >> 16) & 0xff;
    const green = (color >> 8) & 0xff;
    const blue = color & 0xff;
    const fillRed = fillColor === undefined ? 0 : (fillColor >> 16) & 0xff;
    const fillGreen = fillColor === undefined ? 0 : (fillColor >> 8) & 0xff;
    const fillBlue = fillColor === undefined ? 0 : fillColor & 0xff;

    for (let sy = 0; sy < th; sy++) {
        const py = y + (sy + 0.5) / subdiv;
        for (let sx = 0; sx < tw; sx++) {
            const px = x + (sx + 0.5) / subdiv;
            const i = sy * tw + sx;
            const distance = inside[i]
                ? -Math.max(0, (toLand[i] ?? 0) - 0.5) / subdiv
                : Math.max(0, (toWater[i] ?? 0) - 0.5) / subdiv;
            const offset = Math.max(
                -profile.amplitude,
                Math.min(profile.amplitude, profile.offset(px, py))
            );
            const edge = distance - offset;
            const alpha =
                outerFade > 0
                    ? 1 -
                      smoothstep(
                          Math.min(1, Math.max(0, edge / outerFade))
                      )
                    : coverage(edge, aa);
            if (alpha <= 0) continue;
            const o = i * 4;
            pixels[o] = (red * alpha + 0.5) | 0;
            pixels[o + 1] = (green * alpha + 0.5) | 0;
            pixels[o + 2] = (blue * alpha + 0.5) | 0;
            pixels[o + 3] = (alpha * 255 + 0.5) | 0;
            if (fillPixels) {
                const fillAlpha = coverage(edge, aa);
                fillPixels[o] = (fillRed * fillAlpha + 0.5) | 0;
                fillPixels[o + 1] = (fillGreen * fillAlpha + 0.5) | 0;
                fillPixels[o + 2] = (fillBlue * fillAlpha + 0.5) | 0;
                fillPixels[o + 3] = (fillAlpha * 255 + 0.5) | 0;
            }
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
    const fillTexture = fillPixels
        ? new Texture({
              source: new BufferImageSource({
                  width: tw,
                  height: th,
                  format: "rgba8unorm",
                  scaleMode: "linear",
                  addressMode: "clamp-to-edge",
                  alphaMode: "premultiplied-alpha",
                  resource: fillPixels,
              }),
          })
        : undefined;
    return { texture: new Texture({ source }), fillTexture, x, y, w, h };
}

function chamferDistance(
    mask: Uint8Array,
    width: number,
    height: number,
    seed: 0 | 1
): Float32Array {
    const distance = new Float32Array(mask.length);
    distance.fill(Number.POSITIVE_INFINITY);
    for (let i = 0; i < mask.length; i++) {
        if (mask[i] === seed) distance[i] = 0;
    }
    const diagonal = Math.SQRT2;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = y * width + x;
            let value = distance[i] ?? Number.POSITIVE_INFINITY;
            if (x > 0) value = Math.min(value, (distance[i - 1] ?? value) + 1);
            if (y > 0) value = Math.min(value, (distance[i - width] ?? value) + 1);
            if (x > 0 && y > 0) {
                value = Math.min(value, (distance[i - width - 1] ?? value) + diagonal);
            }
            if (x + 1 < width && y > 0) {
                value = Math.min(value, (distance[i - width + 1] ?? value) + diagonal);
            }
            distance[i] = value;
        }
    }
    for (let y = height - 1; y >= 0; y--) {
        for (let x = width - 1; x >= 0; x--) {
            const i = y * width + x;
            let value = distance[i] ?? Number.POSITIVE_INFINITY;
            if (x + 1 < width) value = Math.min(value, (distance[i + 1] ?? value) + 1);
            if (y + 1 < height) value = Math.min(value, (distance[i + width] ?? value) + 1);
            if (x + 1 < width && y + 1 < height) {
                value = Math.min(value, (distance[i + width + 1] ?? value) + diagonal);
            }
            if (x > 0 && y + 1 < height) {
                value = Math.min(value, (distance[i + width - 1] ?? value) + diagonal);
            }
            distance[i] = value;
        }
    }
    return distance;
}

function smoothstep(value: number): number {
    return value * value * (3 - 2 * value);
}
