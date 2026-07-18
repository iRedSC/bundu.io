import {
    Container,
    DisplacementFilter,
    Graphics,
    Rectangle,
    Sprite,
    TilingSprite,
} from "pixi.js";
import { getAsset } from "../../assets/load";
import { oceanFoam, oceanSparkle } from "./particles/foam";
import type {
    GroundModelDef,
    GroundUpdateContext,
    GroundVisual,
    GroundViewBounds,
} from "./types";

const BASE_COLOR = 0x1a5f8a;
const CAUSTICS = "bundu/effect/ocean_caustics.png";
const DISPLACE = "bundu/effect/ocean_displace.png";
const FOAM = "bundu/effect/ocean_foam.png";
const SPARKLE = "bundu/effect/ocean_sparkle.png";

/** Skip displacement when the view is huge (freecam overview). */
const DISPLACE_MAX_AREA = 3_500 * 3_500;
const VIEW_PAD = 80;

const SCROLL_A = { x: 18, y: 11 };
const SCROLL_B = { x: -9, y: 14 };
const DISPLACE_SCROLL = { x: 22, y: -16 };

export function createOceanGround(
    bounds: Rectangle,
    zIndex: number
): GroundVisual {
    const root = new Container();
    root.zIndex = zIndex;

    const fill = new Graphics();
    fill.rect(bounds.x, bounds.y, bounds.width, bounds.height).fill(BASE_COLOR);
    root.addChild(fill);

    const fx = new Container();
    root.addChild(fx);

    const causticsA = new TilingSprite({
        texture: getAsset(CAUSTICS),
        width: 1,
        height: 1,
    });
    causticsA.tint = 0x8ec8e8;
    causticsA.alpha = 0.28;
    causticsA.blendMode = "add";
    causticsA.tileScale.set(0.55, 0.55);

    const causticsB = new TilingSprite({
        texture: getAsset(CAUSTICS),
        width: 1,
        height: 1,
    });
    causticsB.tint = 0xb8e4ff;
    causticsB.alpha = 0.16;
    causticsB.blendMode = "screen";
    causticsB.tileScale.set(0.85, 0.85);
    causticsB.tilePosition.set(40, 70);

    const displaceSprite = new Sprite(getAsset(DISPLACE));
    displaceSprite.visible = false;
    // Keep the map in the scene graph so the filter can sample it.
    root.addChild(displaceSprite);

    const displace = new DisplacementFilter({
        sprite: displaceSprite,
        scale: { x: 14, y: 10 },
    });
    displace.resolution = 0.5;
    displace.padding = 8;

    fx.addChild(causticsA, causticsB);

    let nextFoamAt = 0;
    let nextSparkleAt = 0;
    let displaceOn = false;

    const syncOverlay = (view: GroundViewBounds) => {
        const x = Math.max(bounds.x, view.minX - VIEW_PAD);
        const y = Math.max(bounds.y, view.minY - VIEW_PAD);
        const right = Math.min(bounds.x + bounds.width, view.maxX + VIEW_PAD);
        const bottom = Math.min(bounds.y + bounds.height, view.maxY + VIEW_PAD);
        const w = Math.max(0, right - x);
        const h = Math.max(0, bottom - y);
        if (w < 1 || h < 1) {
            fx.visible = false;
            return { w: 0, h: 0, x, y };
        }
        fx.visible = true;
        fx.position.set(x, y);
        causticsA.width = w;
        causticsA.height = h;
        causticsB.width = w;
        causticsB.height = h;
        return { w, h, x, y };
    };

    return {
        container: root,
        update(ctx: GroundUpdateContext) {
            const sec = ctx.deltaMS / 1000;
            const overlay = syncOverlay(ctx.view);
            if (overlay.w < 1) return;

            causticsA.tilePosition.x += SCROLL_A.x * sec;
            causticsA.tilePosition.y += SCROLL_A.y * sec;
            causticsB.tilePosition.x += SCROLL_B.x * sec;
            causticsB.tilePosition.y += SCROLL_B.y * sec;

            const area = overlay.w * overlay.h;
            const wantDisplace = area <= DISPLACE_MAX_AREA;
            if (wantDisplace !== displaceOn) {
                displaceOn = wantDisplace;
                fx.filters = wantDisplace ? [displace] : null;
                fx.filterArea = wantDisplace
                    ? new Rectangle(0, 0, overlay.w, overlay.h)
                    : undefined;
            } else if (wantDisplace && fx.filterArea) {
                fx.filterArea.width = overlay.w;
                fx.filterArea.height = overlay.h;
            }

            if (wantDisplace) {
                displaceSprite.texture = getAsset(DISPLACE);
                displaceSprite.width = overlay.w * 1.2;
                displaceSprite.height = overlay.h * 1.2;
                displaceSprite.position.set(
                    overlay.x - overlay.w * 0.1 + DISPLACE_SCROLL.x * (ctx.now / 1000),
                    overlay.y - overlay.h * 0.1 + DISPLACE_SCROLL.y * (ctx.now / 1000)
                );
            }

            if (!ctx.emitParticles || area > DISPLACE_MAX_AREA) return;

            if (ctx.now >= nextFoamAt && ctx.shore.length > 0) {
                nextFoamAt = ctx.now + 40 + Math.random() * 50;
                const sample =
                    ctx.shore[Math.floor(Math.random() * ctx.shore.length)];
                if (
                    sample &&
                    sample.x >= ctx.view.minX - 40 &&
                    sample.x <= ctx.view.maxX + 40 &&
                    sample.y >= ctx.view.minY - 40 &&
                    sample.y <= ctx.view.maxY + 40
                ) {
                    const dir = Math.atan2(sample.ny, sample.nx);
                    ctx.emitParticles(
                        oceanFoam(getAsset(FOAM), sample.x, sample.y, dir)
                    );
                }
            }

            if (ctx.now >= nextSparkleAt) {
                nextSparkleAt = ctx.now + 70 + Math.random() * 90;
                // Bias sparkles toward open water: random in view, skip if near
                // many shores by just picking view-random ocean points.
                const sx =
                    ctx.view.minX +
                    Math.random() * (ctx.view.maxX - ctx.view.minX);
                const sy =
                    ctx.view.minY +
                    Math.random() * (ctx.view.maxY - ctx.view.minY);
                if (
                    sx >= bounds.x &&
                    sy >= bounds.y &&
                    sx <= bounds.x + bounds.width &&
                    sy <= bounds.y + bounds.height &&
                    ctx.isOceanAt(sx, sy)
                ) {
                    ctx.emitParticles(
                        oceanSparkle(getAsset(SPARKLE), sx, sy)
                    );
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
