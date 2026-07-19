import {
    BufferImageSource,
    Container,
    Sprite,
    Texture,
    type Rectangle,
} from "pixi.js";
import type { SolidGroundFill } from "@bundu/shared/ground_models";
import { TILE_SIZE } from "@bundu/shared/tiles";
import { shadeLandFill } from "./land_fill_shade";
import {
    LAND_SEAM_FILL_INSET_TILES,
    addLandSeamChunk,
    clearLandSeamLayer,
    type LandSeamChunkBake,
} from "./land_seam";
import type { GroundVisual } from "./types";

/** Texels per tile for inset fill bake — matches former overlay density. */
const FILL_SUBDIV = 16;
/** Hard mountain chips need denser texels so linear filter stays sharp. */
const FILL_SUBDIV_SOLID_BLOBS = 48;
/** Cap either bake edge so huge patches stay cheap. */
const FILL_TEXEL_MAX = 2048;
const FILL_TEXEL_MAX_SOLID_BLOBS = 4096;

export function createSolidGround(
    color: number,
    bounds: Rectangle,
    zIndex: number,
    fill?: SolidGroundFill
): GroundVisual {
    const root = new Container();
    root.zIndex = zIndex;

    const insetPx = LAND_SEAM_FILL_INSET_TILES * TILE_SIZE;
    const insetW = bounds.width - insetPx * 2;
    const insetH = bounds.height - insetPx * 2;
    // Tiny patches: no flat rect; seam bake owns the whole silhouette.
    const useInset = insetW > 0 && insetH > 0;

    let paintLandFill: GroundVisual["paintLandFill"];
    if (useInset) {
        const fillX = bounds.x + insetPx;
        const fillY = bounds.y + insetPx;
        if (fill) {
            const sprite = new Sprite(Texture.WHITE);
            sprite.tint = color;
            sprite.position.set(fillX, fillY);
            sprite.width = insetW;
            sprite.height = insetH;
            root.addChild(sprite);
            let owned: Texture | undefined;
            paintLandFill = (inlandAt) => {
                const next = bakeInsetFill(
                    color,
                    fill,
                    fillX,
                    fillY,
                    insetW,
                    insetH,
                    inlandAt
                );
                owned?.destroy(true);
                owned = next.texture;
                sprite.texture = next.texture;
                sprite.tint = 0xffffff;
            };
        } else {
            // Opaque core inset past max seam cut — edge band owns the perimeter.
            const flat = new Sprite(Texture.WHITE);
            flat.tint = color;
            flat.position.set(fillX, fillY);
            flat.width = insetW;
            flat.height = insetH;
            root.addChild(flat);
        }
    }

    const seamLayer = new Container();
    root.addChild(seamLayer);

    return {
        container: root,
        paintLandFill,
        applyLandSeam(chunk: LandSeamChunkBake) {
            addLandSeamChunk(seamLayer, chunk);
        },
        clearLandSeam() {
            clearLandSeamLayer(seamLayer);
        },
    };
}

function bakeInsetFill(
    color: number,
    fill: SolidGroundFill,
    worldX: number,
    worldY: number,
    worldW: number,
    worldH: number,
    inlandAt: (tileX: number, tileY: number) => number
): { texture: Texture } {
    const tileW = worldW / TILE_SIZE;
    const tileH = worldH / TILE_SIZE;
    const subdiv = fillSubdiv(tileW, tileH, fill);
    const tw = Math.max(1, Math.ceil(tileW * subdiv));
    const th = Math.max(1, Math.ceil(tileH * subdiv));
    const pixels = new Uint8Array(tw * th * 4);
    const br = (color >> 16) & 0xff;
    const bg = (color >> 8) & 0xff;
    const bb = color & 0xff;
    const originTx = worldX / TILE_SIZE;
    const originTy = worldY / TILE_SIZE;

    for (let sy = 0; sy < th; sy++) {
        const py = originTy + (sy + 0.5) / subdiv;
        for (let sx = 0; sx < tw; sx++) {
            const px = originTx + (sx + 0.5) / subdiv;
            const shore = inlandAt(px, py);
            const [r, g, b] = shadeLandFill(br, bg, bb, fill, px, py, shore);
            const o = (sy * tw + sx) * 4;
            pixels[o] = r;
            pixels[o + 1] = g;
            pixels[o + 2] = b;
            pixels[o + 3] = 255;
        }
    }

    const source = new BufferImageSource({
        width: tw,
        height: th,
        format: "rgba8unorm",
        scaleMode: "linear",
        addressMode: "clamp-to-edge",
        alphaMode: "no-premultiply-alpha",
        resource: pixels,
    });
    return { texture: new Texture({ source }) };
}

function fillSubdiv(
    tileW: number,
    tileH: number,
    fill: SolidGroundFill
): number {
    const maxEdge = Math.max(tileW, tileH, 1);
    const target =
        fill === "solid_blobs" ? FILL_SUBDIV_SOLID_BLOBS : FILL_SUBDIV;
    const texelMax =
        fill === "solid_blobs" ? FILL_TEXEL_MAX_SOLID_BLOBS : FILL_TEXEL_MAX;
    const capped = Math.max(1, Math.floor(texelMax / maxEdge));
    return Math.max(1, Math.min(target, capped));
}
