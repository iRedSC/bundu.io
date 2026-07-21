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
    outerFade: number
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

    for (let sy = 0; sy < th; sy++) {
        const py = y + (sy + 0.5) / subdiv;
        for (let sx = 0; sx < tw; sx++) {
            const px = x + (sx + 0.5) / subdiv;
            let alpha = 0;
            for (const rect of bounds) {
                const sdf = boxSdf(px, py, rect.x, rect.y, rect.w, rect.h);
                if (sdf > profile.amplitude + aa) continue;
                const offset = Math.max(
                    -profile.amplitude,
                    Math.min(profile.amplitude, profile.offset(px, py))
                );
                const edge = sdf - offset;
                const fadeAlpha =
                    outerFade > 0
                        ? 1 -
                          smoothstep(
                              Math.min(1, Math.max(0, edge / outerFade))
                          )
                        : coverage(edge, aa);
                alpha = Math.max(alpha, fadeAlpha);
            }
            if (alpha <= 0) continue;
            const o = (sy * tw + sx) * 4;
            const value = (alpha * 255 + 0.5) | 0;
            pixels[o] = value;
            pixels[o + 1] = value;
            pixels[o + 2] = value;
            pixels[o + 3] = value;
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

function smoothstep(value: number): number {
    return value * value * (3 - 2 * value);
}
