import {
    Container,
    type Rectangle,
    Sprite,
    Texture,
    TilingSprite,
} from "pixi.js";
import { getAsset } from "../../assets/load";
import { oceanFoam, oceanSparkle } from "./particles/foam";
import type {
    GroundModelDef,
    GroundUpdateContext,
    GroundVisual,
    GroundViewBounds,
    ShoreSample,
} from "./types";

const BASE_COLOR = 0x1a5f8a;
const CAUSTICS = "bundu/effect/ocean_caustics.png";
const FOAM = "bundu/effect/ocean_foam.png";
const SPARKLE = "bundu/effect/ocean_sparkle.png";

/** Skip FX when freecam overview is huge. */
const FX_MAX_AREA = 2_800 * 2_800;
const VIEW_PAD = 40;

const SCROLL = { x: 14, y: 9 };
const WOBBLE = { x: 6, y: 4 };

/**
 * Cheap ocean: viewport-sized fill + one scrolling caustic layer.
 * No DisplacementFilter (full-view filters were the main hitch).
 * Wave feel comes from sine wobble on tilePosition.
 */
export function createOceanGround(
    bounds: Rectangle,
    zIndex: number
): GroundVisual {
    const root = new Container();
    root.zIndex = zIndex;
    // Avoid a world-sized Graphics (200 tiles²) — draw only the view.
    root.cullable = false;

    const fill = new Sprite(Texture.WHITE);
    fill.tint = BASE_COLOR;
    fill.width = 1;
    fill.height = 1;
    root.addChild(fill);

    const causticsTex = getAsset(CAUSTICS);
    const foamTex = getAsset(FOAM);
    const sparkleTex = getAsset(SPARKLE);

    const caustics = new TilingSprite({
        texture: causticsTex,
        width: 1,
        height: 1,
    });
    caustics.tint = 0x9fd0ea;
    caustics.alpha = 0.32;
    caustics.blendMode = "add";
    caustics.tileScale.set(0.7, 0.7);
    root.addChild(caustics);

    let nextFoamAt = 0;
    let nextSparkleAt = 0;
    let nextShoreFilterAt = 0;
    let visibleShores: ShoreSample[] = [];
    let overlayX = 0;
    let overlayY = 0;
    let overlayW = 0;
    let overlayH = 0;
    let scrollX = 0;
    let scrollY = 0;

    const syncOverlay = (view: GroundViewBounds) => {
        const x = Math.max(bounds.x, view.minX - VIEW_PAD);
        const y = Math.max(bounds.y, view.minY - VIEW_PAD);
        const right = Math.min(bounds.x + bounds.width, view.maxX + VIEW_PAD);
        const bottom = Math.min(bounds.y + bounds.height, view.maxY + VIEW_PAD);
        const w = Math.max(0, right - x);
        const h = Math.max(0, bottom - y);
        if (w < 1 || h < 1) {
            fill.visible = false;
            caustics.visible = false;
            overlayW = 0;
            return false;
        }

        // Only rewrite transforms when the view moved/resized meaningfully.
        if (
            Math.abs(x - overlayX) > 1 ||
            Math.abs(y - overlayY) > 1 ||
            Math.abs(w - overlayW) > 1 ||
            Math.abs(h - overlayH) > 1
        ) {
            overlayX = x;
            overlayY = y;
            overlayW = w;
            overlayH = h;
            fill.visible = true;
            fill.position.set(x, y);
            fill.width = w;
            fill.height = h;
            caustics.visible = true;
            caustics.position.set(x, y);
            caustics.width = w;
            caustics.height = h;
        } else {
            fill.visible = true;
            caustics.visible = true;
        }
        return true;
    };

    return {
        container: root,
        update(ctx: GroundUpdateContext) {
            if (!syncOverlay(ctx.view)) return;

            const area = overlayW * overlayH;
            if (area > FX_MAX_AREA) {
                caustics.visible = false;
                return;
            }

            const sec = ctx.deltaMS / 1000;
            scrollX += SCROLL.x * sec;
            scrollY += SCROLL.y * sec;
            const t = ctx.now * 0.001;
            caustics.tilePosition.x = scrollX + Math.sin(t * 0.7) * WOBBLE.x;
            caustics.tilePosition.y = scrollY + Math.cos(t * 0.55) * WOBBLE.y;

            if (!ctx.emitParticles) return;

            if (ctx.now >= nextShoreFilterAt) {
                nextShoreFilterAt = ctx.now + 250;
                const pad = 60;
                const minX = ctx.view.minX - pad;
                const maxX = ctx.view.maxX + pad;
                const minY = ctx.view.minY - pad;
                const maxY = ctx.view.maxY + pad;
                visibleShores = [];
                for (const s of ctx.shore) {
                    if (
                        s.x >= minX &&
                        s.x <= maxX &&
                        s.y >= minY &&
                        s.y <= maxY
                    ) {
                        visibleShores.push(s);
                    }
                }
            }

            if (ctx.now >= nextFoamAt && visibleShores.length > 0) {
                nextFoamAt = ctx.now + 180 + Math.random() * 220;
                const sample =
                    visibleShores[
                        Math.floor(Math.random() * visibleShores.length)
                    ];
                if (sample) {
                    ctx.emitParticles(
                        oceanFoam(
                            foamTex,
                            sample.x,
                            sample.y,
                            Math.atan2(sample.ny, sample.nx)
                        )
                    );
                }
            }

            if (ctx.now >= nextSparkleAt) {
                nextSparkleAt = ctx.now + 280 + Math.random() * 320;
                const sx =
                    ctx.view.minX +
                    Math.random() * (ctx.view.maxX - ctx.view.minX);
                const sy =
                    ctx.view.minY +
                    Math.random() * (ctx.view.maxY - ctx.view.minY);
                if (ctx.isOceanAt(sx, sy)) {
                    ctx.emitParticles(oceanSparkle(sparkleTex, sx, sy));
                }
            }
        },
    };
}

export const oceanModel: GroundModelDef = {
    id: "ocean",
    color: "#1a5f8a",
    create: createOceanGround,
};
