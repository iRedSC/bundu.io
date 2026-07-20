import type { OceanGroundModelDef } from "@bundu/shared/ground_models";
import { parseHexColor } from "@bundu/shared/ground_models";
import { toSanitizedTexturePath } from "@bundu/shared/models/texture_paths";
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
import {
    bindNearshoreSprite,
    type NearshoreBindState,
} from "./nearshore_fill";
import { oceanFx, oceanTint } from "./ocean_fx";
import { oceanFoam, oceanSparkle } from "./particles/foam";
import {
    createDropletDisplacementTexture,
    createSplashRefractionFilter,
} from "./splash_refraction";
import { sizeEnvelope } from "../../rendering/particles/size_envelope";
import type {
    GroundUpdateContext,
    GroundVisual,
    GroundViewBounds,
    ShoreSample,
} from "./types";

const SPLASH_OVERLAY_Z = 1_000_000_000;
/** Cap bake RT edge so huge views stay cheap. */
const BAKE_RT_MAX = 1024;

function tex(path: string): Texture {
    return getAsset(toSanitizedTexturePath(path));
}

function worldTile(overlay: number, scroll: number): number {
    return scroll - overlay;
}

/**
 * Shared viewport-scoped ocean effects. Ground patches render their opaque
 * color separately so the fading effects mask cannot create a coastline halo.
 */
export function createOceanGround(
    model: OceanGroundModelDef,
    bounds: Rectangle,
    zIndex: number
): GroundVisual {
    const root = new Container();
    root.zIndex = zIndex;
    root.cullable = false;

    const causticsTex = tex(model.textures.caustics);
    const displaceTex = tex(model.textures.displace);
    const rippleIdleTex = tex(model.textures.rippleIdle);
    const rippleMoveTex = tex(model.textures.rippleMove);
    const foamTex = tex(model.textures.foam);
    const sparkleTex = tex(model.textures.sparkle);
    const dropletTex = createDropletDisplacementTexture();

    displaceTex.source.addressMode = "repeat";
    for (const ripple of [rippleIdleTex, rippleMoveTex]) {
        ripple.source.addressMode = "clamp-to-edge";
        ripple.source.alphaMode = "no-premultiply-alpha";
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
    /** Per-model mask from World; falls back to the shared shore mask. */
    let modelShoreMask: Texture | undefined;

    const causticsA = new TilingSprite({
        texture: causticsTex,
        width: 1,
        height: 1,
    });
    causticsA.blendMode = "add";
    fx.addChild(causticsA);

    const causticsB = new TilingSprite({
        texture: causticsTex,
        width: 1,
        height: 1,
    });
    causticsB.blendMode = "add";
    fx.addChild(causticsB);

    const bake = new Container();
    const swellBig = new TilingSprite({
        texture: displaceTex,
        width: 64,
        height: 64,
    });
    swellBig.blendMode = "normal-npm";
    bake.addChild(swellBig);

    const swellSmall = new TilingSprite({
        texture: displaceTex,
        width: 64,
        height: 64,
    });
    swellSmall.blendMode = "normal-npm";
    bake.addChild(swellSmall);

    const mapRt = RenderTexture.create({
        width: 64,
        height: 64,
        dynamic: true,
    });
    const mapSprite = new Sprite(mapRt);
    mapSprite.renderable = false;
    root.addChild(mapSprite);

    const displaceFilter = new DisplacementFilter({
        sprite: mapSprite,
        scale: oceanFx.displaceStrength,
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

    type Splash = {
        x: number;
        y: number;
        born: number;
        updatedAt: number;
        velocityX: number;
        velocityY: number;
        lifetime: number;
        startSize: number;
        peakSize: number | undefined;
        rotation: number;
    };
    const splashes: Splash[] = [];
    const splashSprites: Sprite[] = [];
    const splashBake = new Container();
    const splashRt = RenderTexture.create({
        width: 64,
        height: 64,
        dynamic: true,
    });
    const splashOverlay = new Sprite(splashRt);
    splashOverlay.zIndex = SPLASH_OVERLAY_Z;
    splashOverlay.visible = false;
    const splashRefraction = createSplashRefractionFilter();
    const splashFilter = splashRefraction.filter;
    splashFilter.padding = oceanFx.splash.strength + 8;
    splashOverlay.filters = [splashFilter];

    const ensureWakeSprite = (i: number, kind: "idle" | "move"): Sprite => {
        const texture = kind === "move" ? rippleMoveTex : rippleIdleTex;
        let sprite = wakeSprites[i];
        if (!sprite) {
            sprite = new Sprite(texture);
            sprite.anchor.set(0.5);
            sprite.blendMode = "normal-npm";
            wakeSprites[i] = sprite;
            bake.addChild(sprite);
        } else if (sprite.texture !== texture) {
            sprite.texture = texture;
        }
        sprite.visible = true;
        return sprite;
    };

    const addWakeRipple = (
        worldX: number,
        worldY: number,
        now: number,
        kind: "idle" | "move" = "idle"
    ) => {
        if (wakes.length >= oceanFx.wake.max) return;
        wakes.push({ x: worldX, y: worldY, born: now, kind });
    };

    const addSplashDisplacement = (
        worldX: number,
        worldY: number,
        now: number,
        direction: number,
        speed: number,
        intensity = 1
    ) => {
        const { splash } = oceanFx;
        const count = Math.max(
            1,
            Math.round((6 + ((Math.random() * 3) | 0)) * Math.max(0, intensity))
        );
        const lo = Math.max(20, speed * splash.speedMin);
        const hi = Math.max(lo + 1, speed * splash.speedMax);
        const spread = (splash.spreadDeg * Math.PI) / 180;
        for (let i = 0; i < count && splashes.length < splash.max; i++) {
            const angle = direction + (Math.random() - 0.5) * spread;
            const particleSpeed = lo + Math.random() * (hi - lo);
            const peakSize =
                splash.peakSizeMin !== undefined &&
                splash.peakSizeMax !== undefined
                    ? splash.peakSizeMin +
                      Math.random() *
                          (splash.peakSizeMax - splash.peakSizeMin)
                    : undefined;
            splashes.push({
                x: worldX,
                y: worldY,
                born: now,
                updatedAt: now,
                velocityX: Math.cos(angle) * particleSpeed,
                velocityY: Math.sin(angle) * particleSpeed,
                lifetime: 450 + Math.random() * 300,
                startSize:
                    splash.sizeMin +
                    Math.random() * (splash.sizeMax - splash.sizeMin),
                peakSize,
                rotation: Math.random() * Math.PI * 2,
            });
        }
    };

    const splashSprite = (i: number): Sprite => {
        let sprite = splashSprites[i];
        if (!sprite) {
            sprite = new Sprite(dropletTex);
            sprite.anchor.set(0.5);
            sprite.blendMode = "normal-npm";
            splashSprites[i] = sprite;
            splashBake.addChild(sprite);
        }
        sprite.visible = true;
        return sprite;
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
        const { wake, swell, displaceStrength, splash } = oceanFx;
        for (let i = wakes.length - 1; i >= 0; i--) {
            const entry = wakes[i];
            if (!entry || now - entry.born >= wake.lifeMs) wakes.splice(i, 1);
        }
        for (let i = splashes.length - 1; i >= 0; i--) {
            const entry = splashes[i];
            if (!entry || now - entry.born >= entry.lifetime) {
                splashes.splice(i, 1);
            }
        }

        if (overlayW < 1 || overlayH < 1) return;

        const scale = Math.min(1, BAKE_RT_MAX / Math.max(overlayW, overlayH));
        const rtW = Math.max(1, Math.ceil(overlayW * scale));
        const rtH = Math.max(1, Math.ceil(overlayH * scale));
        if (mapRt.width !== rtW || mapRt.height !== rtH) {
            mapRt.resize(rtW, rtH);
        }
        if (splashRt.width !== rtW || splashRt.height !== rtH) {
            splashRt.resize(rtW, rtH);
        }

        swellBig.width = rtW;
        swellBig.height = rtH;
        swellSmall.width = rtW;
        swellSmall.height = rtH;
        swellBig.alpha = swell.big.alpha;
        swellSmall.alpha = swell.small.alpha;

        const texW = Math.max(1, displaceTex.width);
        swellBig.tileScale.set((swell.big.world * scale) / texW);
        swellSmall.tileScale.set((swell.small.world * scale) / texW);
        swellBig.tilePosition.set(
            (scrollDx - overlayX) * scale,
            (scrollDy - overlayY) * scale
        );
        swellSmall.tilePosition.set(
            (scrollD2x - overlayX) * scale,
            (scrollD2y - overlayY) * scale
        );

        for (const sprite of wakeSprites) sprite.visible = false;
        for (let i = 0; i < wakes.length; i++) {
            const entry = wakes[i];
            if (!entry) continue;
            const t = (now - entry.born) / wake.lifeMs;
            const sprite = ensureWakeSprite(i, entry.kind);
            const kindFx = entry.kind === "move" ? wake.move : wake.idle;
            const size =
                kindFx.startSize + ((now - entry.born) / 1000) * kindFx.growSpeed;
            const rippleSize = Math.max(1, sprite.texture.width);
            sprite.position.set(
                (entry.x - overlayX) * scale,
                (entry.y - overlayY) * scale
            );
            sprite.scale.set((size / rippleSize) * scale);
            const fade =
                entry.kind === "idle" ? (1 - t) ** 0.55 : (1 - t) * (1 - t);
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
        const zoom = Math.hypot(fx.worldTransform.a, fx.worldTransform.b);
        const strength = displaceStrength * Math.max(0.001, zoom);
        displaceFilter.scale.x = strength;
        displaceFilter.scale.y = strength;
        const padding = Math.ceil(strength + 8);
        if (Math.abs(padding - displaceFilter.padding) >= 2) {
            displaceFilter.padding = padding;
        }

        for (const sprite of splashSprites) sprite.visible = false;
        for (let i = 0; i < splashes.length; i++) {
            const entry = splashes[i];
            if (!entry) continue;
            const deltaSeconds = Math.max(0, now - entry.updatedAt) / 1000;
            entry.updatedAt = now;
            const friction = Math.exp(-splash.friction * deltaSeconds);
            entry.velocityX *= friction;
            entry.velocityY *= friction;
            entry.x += entry.velocityX * deltaSeconds;
            entry.y += entry.velocityY * deltaSeconds;
            const t = (now - entry.born) / entry.lifetime;
            const sprite = splashSprite(i);
            sprite.position.set(
                (entry.x - overlayX) * scale,
                (entry.y - overlayY) * scale
            );
            sprite.rotation = entry.rotation;
            const size = sizeEnvelope(
                t,
                entry.startSize,
                splash.sizeEnd,
                entry.peakSize,
                splash.peakAt
            );
            sprite.scale.set(
                (size / Math.max(1, sprite.texture.width)) * scale
            );
            sprite.alpha = 1 - t;
        }

        splashOverlay.visible = splashes.length > 0;
        if (!splashOverlay.visible) return;
        renderer.render({
            container: splashBake,
            target: splashRt,
            clear: true,
            clearColor: { r: 0.5, g: 0.5, b: 0.5, a: 0 },
        });
        splashOverlay.texture = splashRt;
        splashOverlay.position.set(overlayX, overlayY);
        splashOverlay.width = overlayW;
        splashOverlay.height = overlayH;
        const splashStrength = splash.strength * Math.max(0.001, zoom);
        splashRefraction.setStrength(splashStrength);
        splashFilter.padding = Math.ceil(splashStrength + 8);
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
        const overshoot = oceanFx.displaceStrength + 40;
        const x = Math.max(bounds.x, view.minX - overshoot);
        const y = Math.max(bounds.y, view.minY - overshoot);
        const right = Math.min(
            bounds.x + bounds.width,
            view.maxX + overshoot
        );
        const bottom = Math.min(
            bounds.y + bounds.height,
            view.maxY + overshoot
        );
        const w = Math.max(0, right - x);
        const h = Math.max(0, bottom - y);
        if (w < 1 || h < 1) {
            fx.visible = false;
            splashOverlay.visible = false;
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
        overlay: splashOverlay,
        /** Displace-filtered + shore-masked layer — parent underwater overlays here. */
        fxLayer: fx,
        addWakeRipple,
        addSplashDisplacement,
        setShoreMask(texture: Texture) {
            if (modelShoreMask === texture) return;
            modelShoreMask = texture;
            // Force rebind on next update when the bake source is replaced.
            maskBind.map?.destroy(false);
            maskBind.source = undefined;
            maskBind.map = undefined;
        },
        update(ctx: GroundUpdateContext) {
            const cfg = oceanFx;
            const { a, b } = cfg.caustics;
            const tint = model.causticTint;
            causticsA.tint = oceanTint(tint?.a ?? a.tint);
            causticsA.alpha = a.alpha;
            causticsA.tileScale.set(a.tileScale);
            causticsB.tint = oceanTint(tint?.b ?? b.tint);
            causticsB.alpha = b.alpha;
            causticsB.tileScale.set(b.tileScale);

            bindNearshoreSprite(
                fxMask,
                bounds,
                modelShoreMask ?? ctx.shoreMask,
                maskBind
            );
            if (!syncOverlay(ctx.view)) return;

            const area = overlayW * overlayH;
            const heavy = area > cfg.heavyArea;
            displaceFilter.resolution = heavy ? 0.35 : 0.75;
            fx.filters = [displaceFilter];

            const sec = ctx.deltaMS / 1000;
            scrollAx += a.scroll.x * sec;
            scrollAy += a.scroll.y * sec;
            scrollBx += b.scroll.x * sec;
            scrollBy += b.scroll.y * sec;
            scrollDx += cfg.swell.big.scroll.x * sec;
            scrollDy += cfg.swell.big.scroll.y * sec;
            scrollD2x += cfg.swell.small.scroll.x * sec;
            scrollD2y += cfg.swell.small.scroll.y * sec;

            causticsA.tilePosition.set(
                worldTile(overlayX, scrollAx),
                worldTile(overlayY, scrollAy)
            );
            causticsB.tilePosition.set(
                worldTile(overlayX, scrollBx),
                worldTile(overlayY, scrollBy)
            );

            bakeDisplace(ctx.renderer, ctx.now);

            if (area > cfg.particleMaxArea || !ctx.emitParticles) return;

            const { foamIntervalMs, sparkleIntervalMs, shoreFilterMs } =
                cfg.particles;

            if (ctx.now >= nextShoreFilterAt) {
                nextShoreFilterAt = ctx.now + shoreFilterMs;
                const pad = 60;
                const minX = ctx.view.minX - pad;
                const maxX = ctx.view.maxX + pad;
                const minY = ctx.view.minY - pad;
                const maxY = ctx.view.maxY + pad;
                visibleShores = [];
                for (const sample of ctx.shore) {
                    if (
                        sample.x >= minX &&
                        sample.x <= maxX &&
                        sample.y >= minY &&
                        sample.y <= maxY
                    ) {
                        visibleShores.push(sample);
                    }
                }
            }

            const onThisWater = (x: number, y: number) =>
                (ctx.waterModelAt?.(x, y) ??
                    (ctx.isOceanAt(x, y) ? model.id : undefined)) === model.id;

            if (ctx.now >= nextFoamAt && visibleShores.length > 0) {
                const [lo, hi] = foamIntervalMs;
                nextFoamAt = ctx.now + lo + Math.random() * (hi - lo);
                const sample =
                    visibleShores[
                        Math.floor(Math.random() * visibleShores.length)
                    ];
                // Samples sit on the land lip — step into water to resolve model.
                if (
                    sample &&
                    onThisWater(
                        sample.x + sample.nx * 24,
                        sample.y + sample.ny * 24
                    )
                ) {
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
                const [lo, hi] = sparkleIntervalMs;
                nextSparkleAt = ctx.now + lo + Math.random() * (hi - lo);
                const sx =
                    ctx.view.minX +
                    Math.random() * (ctx.view.maxX - ctx.view.minX);
                const sy =
                    ctx.view.minY +
                    Math.random() * (ctx.view.maxY - ctx.view.minY);
                if (onThisWater(sx, sy)) {
                    ctx.emitParticles(oceanSparkle(sparkleTex, sx, sy));
                }
            }
        },
    };
}

/** Ocean color fill for one authored ground rectangle. */
export function createOceanFill(
    model: OceanGroundModelDef,
    bounds: Rectangle,
    zIndex: number
): GroundVisual {
    const fill = new Sprite(Texture.WHITE);
    fill.tint = parseHexColor(model.color);
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
