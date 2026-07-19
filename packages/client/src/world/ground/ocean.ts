import {
    Container,
    DisplacementFilter,
    type Rectangle,
    type Renderer,
    RenderTexture,
    Sprite,
    Texture,
    TilingSprite,
} from "pixi.js";
import { getAsset } from "../../assets/load";
import { oceanFoam, oceanSparkle } from "./particles/foam";
import {
    bindNearshoreSprite,
    type NearshoreBindState,
} from "./nearshore_fill";
import type {
    GroundModelDef,
    GroundUpdateContext,
    GroundVisual,
    GroundViewBounds,
    ShoreSample,
} from "./types";

const BASE_COLOR = 0x1a5f8a;
const CAUSTICS = "bundu/effect/ocean_caustics.png";
const DISPLACE = "bundu/effect/ocean_displace.png";
const RIPPLE_IDLE = "bundu/effect/ocean_ripple.png";
const RIPPLE_MOVE = "bundu/effect/ocean_ripple_move.png";
const FOAM = "bundu/effect/ocean_foam.png";
const SPARKLE = "bundu/effect/ocean_sparkle.png";

/** Soften heavy FX past this view area; never fully cull displace/caustics. */
const FX_HEAVY_AREA = 2_800 * 2_800;
/** Skip ambient particles past this (spawn cost scales with view). */
const FX_PARTICLE_MAX_AREA = 6_000 * 6_000;

const SCROLL_A = { x: 12, y: 8 };
const SCROLL_B = { x: -9, y: 11 };
const SCROLL_D = { x: 28, y: 18 };
const SCROLL_D2 = { x: 42, y: 27 };
const TILE_A = 2.4;
const TILE_B = 1.15;

/** World px covered by one swell tile in the bake. */
const SWELL_BIG_WORLD = 720;
const SWELL_SMALL_WORLD = 280;
/** How strongly each swell layer composites into the shared map. */
const SWELL_BIG_ALPHA = 0.4;
const SWELL_SMALL_ALPHA = 0.18;

const WAKE_MAX = 300;
const WAKE_LIFE_MS = 5000;
const IDLE_START_SIZE = 160;
const IDLE_GROW_SPEED = 160;
const MOVE_START_SIZE = 90;
const MOVE_GROW_SPEED = 240;
/** Single displace pass strength (swell + wakes share this). */
const DISPLACE_STRENGTH = 140;
/**
 * Extra world pad on caustics / displace bake so the filter can sample past
 * the view edge. ≈ {@link DISPLACE_STRENGTH} world units (warp is strength×zoom).
 */
const DISPLACE_OVERSHOOT = DISPLACE_STRENGTH + 40;
/** Cap bake RT edge so huge views stay cheap. */
const BAKE_RT_MAX = 1024;

function worldTile(overlay: number, scroll: number): number {
    return scroll - overlay;
}

/**
 * Shared viewport-scoped ocean effects. Ground patches render their opaque
 * color separately so the fading effects mask cannot create a coastline halo.
 */
export function createOceanGround(
    bounds: Rectangle,
    zIndex: number
): GroundVisual {
    const root = new Container();
    root.zIndex = zIndex;
    root.cullable = false;

    const causticsTex = getAsset(CAUSTICS);
    const displaceTex = getAsset(DISPLACE);
    const rippleIdleTex = getAsset(RIPPLE_IDLE);
    const rippleMoveTex = getAsset(RIPPLE_MOVE);
    const foamTex = getAsset(FOAM);
    const sparkleTex = getAsset(SPARKLE);
    displaceTex.source.addressMode = "repeat";
    for (const tex of [rippleIdleTex, rippleMoveTex]) {
        tex.source.addressMode = "clamp-to-edge";
        tex.source.alphaMode = "no-premultiply-alpha";
    }

    const fx = new Container();
    root.addChild(fx);

    /** Fade effects over shore; the opaque color fill remains outside this mask. */
    const fxMask = new Sprite(Texture.WHITE);
    fxMask.position.set(bounds.x, bounds.y);
    fxMask.width = bounds.width;
    fxMask.height = bounds.height;
    root.addChild(fxMask);
    fx.setMask({ mask: fxMask, channel: "alpha" });
    const maskBind: NearshoreBindState = {};

    const causticsA = new TilingSprite({
        texture: causticsTex,
        width: 1,
        height: 1,
    });
    causticsA.tint = 0x366888;
    causticsA.alpha = 0.055;
    causticsA.blendMode = "add";
    causticsA.tileScale.set(TILE_A);
    fx.addChild(causticsA);

    const causticsB = new TilingSprite({
        texture: causticsTex,
        width: 1,
        height: 1,
    });
    causticsB.tint = 0x8cc3e8;
    causticsB.alpha = 0.045;
    causticsB.blendMode = "add";
    causticsB.tileScale.set(TILE_B);
    fx.addChild(causticsB);

    // Swell layers + wake ripples distort the low ocean effects pass.
    const bake = new Container();
    const swellBig = new TilingSprite({
        texture: displaceTex,
        width: 64,
        height: 64,
    });
    swellBig.blendMode = "normal-npm";
    swellBig.alpha = SWELL_BIG_ALPHA;
    bake.addChild(swellBig);

    const swellSmall = new TilingSprite({
        texture: displaceTex,
        width: 64,
        height: 64,
    });
    swellSmall.blendMode = "normal-npm";
    swellSmall.alpha = SWELL_SMALL_ALPHA;
    bake.addChild(swellSmall);

    let mapRt = RenderTexture.create({
        width: 64,
        height: 64,
        dynamic: true,
    });
    const mapSprite = new Sprite(mapRt);
    // Keep in the tree for DisplacementFilter transforms; don't composite it.
    mapSprite.renderable = false;
    root.addChild(mapSprite);

    const displaceFilter = new DisplacementFilter({
        sprite: mapSprite,
        scale: DISPLACE_STRENGTH,
        padding: 80,
        resolution: 0.75,
    });
    fx.filters = [displaceFilter];

    type Wake = {
        x: number;
        y: number;
        born: number;
        kind: "idle" | "move";
    };
    const wakes: Wake[] = [];
    const wakeSprites: Sprite[] = [];


    const ensureWakeSprite = (i: number, kind: "idle" | "move"): Sprite => {
        const tex = kind === "move" ? rippleMoveTex : rippleIdleTex;
        let s = wakeSprites[i];
        if (!s) {
            s = new Sprite(tex);
            s.anchor.set(0.5);
            s.blendMode = "normal-npm";
            wakeSprites[i] = s;
            bake.addChild(s);
        } else if (s.texture !== tex) {
            s.texture = tex;
        }
        s.visible = true;
        return s;
    };

    const addWakeRipple = (
        worldX: number,
        worldY: number,
        now: number,
        kind: "idle" | "move" = "idle"
    ) => {
        if (wakes.length >= WAKE_MAX) return;
        wakes.push({ x: worldX, y: worldY, born: now, kind });
    };



    let overlayX = 0;
    let overlayY = 0;
    let overlayW = 0;
    let overlayH = 0;
    let scrollAx = 0;
    let scrollAy = 0;
    let scrollBx = 0;
    let scrollBy = 0;
    let scrollDx = 0;
    let scrollDy = 0;
    let scrollD2x = 0;
    let scrollD2y = 0;

    const bakeDisplace = (renderer: Renderer, now: number) => {
        for (let i = wakes.length - 1; i >= 0; i--) {
            const wake = wakes[i];
            if (!wake || now - wake.born >= WAKE_LIFE_MS) wakes.splice(i, 1);
        }

        if (overlayW < 1 || overlayH < 1) return;

        const scale = Math.min(1, BAKE_RT_MAX / Math.max(overlayW, overlayH));
        const rtW = Math.max(1, Math.ceil(overlayW * scale));
        const rtH = Math.max(1, Math.ceil(overlayH * scale));
        if (mapRt.width !== rtW || mapRt.height !== rtH) {
            mapRt.resize(rtW, rtH);
        }

        swellBig.width = rtW;
        swellBig.height = rtH;
        swellSmall.width = rtW;
        swellSmall.height = rtH;

        const texW = Math.max(1, displaceTex.width);
        // tileScale: how big one texture is in bake pixels
        const bigTile = (SWELL_BIG_WORLD * scale) / texW;
        const smallTile = (SWELL_SMALL_WORLD * scale) / texW;
        swellBig.tileScale.set(bigTile);
        swellSmall.tileScale.set(smallTile);
        // World-locked scroll in bake space
        swellBig.tilePosition.set(
            (scrollDx - overlayX) * scale,
            (scrollDy - overlayY) * scale
        );
        swellSmall.tilePosition.set(
            (scrollD2x - overlayX) * scale,
            (scrollD2y - overlayY) * scale
        );

        for (const s of wakeSprites) s.visible = false;
        for (let i = 0; i < wakes.length; i++) {
            const wake = wakes[i];
            if (!wake) continue;
            const t = (now - wake.born) / WAKE_LIFE_MS;
            const sprite = ensureWakeSprite(i, wake.kind);
            const start =
                wake.kind === "move" ? MOVE_START_SIZE : IDLE_START_SIZE;
            const grow =
                wake.kind === "move" ? MOVE_GROW_SPEED : IDLE_GROW_SPEED;
            const size = start + ((now - wake.born) / 1000) * grow;
            const rippleSize = Math.max(1, sprite.texture.width);
            sprite.position.set(
                (wake.x - overlayX) * scale,
                (wake.y - overlayY) * scale
            );
            sprite.scale.set((size / rippleSize) * scale);
            // Idle stays punchy longer; move fades with a steeper falloff.
            const fade =
                wake.kind === "idle"
                    ? Math.pow(1 - t, 0.55)
                    : (1 - t) * (1 - t);
            sprite.alpha = Math.max(0, fade);
        }

        renderer.render({
            container: bake,
            target: mapRt,
            clear: true,
            clearColor: { r: 0.5, g: 0.5, b: 0.5, a: 1 },
        });

        mapSprite.texture = mapRt;
        mapSprite.position.set(overlayX, overlayY);
        mapSprite.width = overlayW;
        mapSprite.height = overlayH;
        // DisplacementFilter.scale is screen-space — multiply by zoom so
        // warp stays the same size in the world at any camera zoom.
        const zoom = Math.hypot(fx.worldTransform.a, fx.worldTransform.b);
        const strength = DISPLACE_STRENGTH * Math.max(0.001, zoom);
        displaceFilter.scale.x = strength;
        displaceFilter.scale.y = strength;
        // Padding must be ≥ scale or the filter RT clips the warp (visible box).
        const padding = Math.ceil(strength + 8);
        if (Math.abs(padding - displaceFilter.padding) >= 2) {
            displaceFilter.padding = padding;
        }

    };

    let nextFoamAt = 0;
    let nextSparkleAt = 0;
    let nextShoreFilterAt = 0;
    let visibleShores: ShoreSample[] = [];

    const setOverlay = (x: number, y: number, w: number, h: number) => {
        causticsA.position.set(x, y);
        causticsA.width = w;
        causticsA.height = h;
        causticsB.position.set(x, y);
        causticsB.width = w;
        causticsB.height = h;
    };

    const syncOverlay = (view: GroundViewBounds) => {
        const x = Math.max(bounds.x, view.minX - DISPLACE_OVERSHOOT);
        const y = Math.max(bounds.y, view.minY - DISPLACE_OVERSHOOT);
        const right = Math.min(
            bounds.x + bounds.width,
            view.maxX + DISPLACE_OVERSHOOT
        );
        const bottom = Math.min(
            bounds.y + bounds.height,
            view.maxY + DISPLACE_OVERSHOOT
        );
        const w = Math.max(0, right - x);
        const h = Math.max(0, bottom - y);
        if (w < 1 || h < 1) {
            fx.visible = false;
            overlayW = 0;
            return false;
        }

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
            setOverlay(x, y, w, h);
        }
        fx.visible = true;
        return true;
    };

    return {
        container: root,
        addWakeRipple,
        update(ctx: GroundUpdateContext) {
            bindNearshoreSprite(fxMask, bounds, ctx.shoreMask, maskBind);
            if (!syncOverlay(ctx.view)) return;

            const area = overlayW * overlayH;
            // Always keep caustics + displace; drop resolution when the view is
            // huge so freecam overview stays cheap but not blank.
            const heavy = area > FX_HEAVY_AREA;
            displaceFilter.resolution = heavy ? 0.35 : 0.75;
            fx.filters = [displaceFilter];

            const sec = ctx.deltaMS / 1000;
            scrollAx += SCROLL_A.x * sec;
            scrollAy += SCROLL_A.y * sec;
            scrollBx += SCROLL_B.x * sec;
            scrollBy += SCROLL_B.y * sec;
            scrollDx += SCROLL_D.x * sec;
            scrollDy += SCROLL_D.y * sec;
            scrollD2x += SCROLL_D2.x * sec;
            scrollD2y += SCROLL_D2.y * sec;

            causticsA.tilePosition.set(
                worldTile(overlayX, scrollAx),
                worldTile(overlayY, scrollAy)
            );
            causticsB.tilePosition.set(
                worldTile(overlayX, scrollBx),
                worldTile(overlayY, scrollBy)
            );

            bakeDisplace(ctx.renderer, ctx.now);

            if (area > FX_PARTICLE_MAX_AREA || !ctx.emitParticles) return;

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

/** Opaque ocean color for one authored ground rectangle. */
export function createOceanFill(
    bounds: Rectangle,
    zIndex: number
): GroundVisual {
    const fill = new Sprite(Texture.WHITE);
    fill.tint = BASE_COLOR;
    fill.position.set(bounds.x, bounds.y);
    fill.width = bounds.width;
    fill.height = bounds.height;
    fill.zIndex = zIndex;
    const bind: NearshoreBindState = {};

    return {
        container: fill,
        update(ctx) {
            bindNearshoreSprite(fill, bounds, ctx.shoreColor, bind);
        },
    };
}

export const oceanModel: GroundModelDef = {
    id: "ocean",
    color: "#1a5f8a",
    create: createOceanGround,
};
