import type { OceanGroundModelDef } from "@bundu/shared/ground_models";
import { parseHexColor } from "@bundu/shared/ground_models";
import { toSanitizedTexturePath } from "@bundu/shared/models/texture_paths";
import {
    Container,
    DisplacementFilter,
    Rectangle,
    type Renderer,
    RenderTexture,
    Sprite,
    Texture,
    TilingSprite,
} from "pixi.js";
import { getAsset } from "../../assets/load";
import { TILE_SIZE, WORLD_TILES } from "@bundu/shared/tiles";
import {
    bindNearshoreSprite,
    type NearshoreBindState,
} from "./nearshore_fill";
import { POND_SEAM_AMPLITUDE, seamOffsetPond } from "./land_seam";
import {
    bakeOrganicRectMask,
    ORGANIC_EDGE_SUBDIV,
    ORGANIC_EDGE_TEXTURE_MAX,
} from "./organic_boundary";
import { AnchoredDisplacementFilter } from "./anchored_displacement";
import { ambientRate } from "./ambient_fx";
import { oceanFx, oceanTint } from "./ocean_fx";
import {
    oceanSparkle,
    oceanWaveWash,
    type WaveSplashSpawn,
} from "./particles/foam";
import {
    createDropletDisplacementTexture,
    createSplashRefractionFilter,
} from "./splash_refraction";
import { sizeEnvelope } from "../../rendering/particles/size_envelope";
import {
    surgeAlong,
    surgeRetreatFromHit,
    surgeRetreatTravel,
} from "../../rendering/particles/surge";
import type { ParticleBlockHit } from "../../rendering/particles/types";
import type {
    GroundUpdateContext,
    GroundVisual,
    GroundViewBounds,
    ShoreSample,
} from "./types";

const SPLASH_OVERLAY_Z = 1_000_000_000;
/** Cap bake RT edge so huge views stay cheap. */
const BAKE_RT_MAX = 1024;
/** Let pond caustics clear the organic edge before disappearing. */
const ORGANIC_FX_OVERSHOOT_TILES = 0.25;
/** World-space radius sampled when stabilizing anchored displacement. */
const ANCHORED_DISPLACE_SAMPLE_RADIUS = 64;

function tex(path: string): Texture {
    return getAsset(toSanitizedTexturePath(path));
}

function worldTile(overlay: number, scroll: number): number {
    return scroll - overlay;
}

function mixRgb(a: number, b: number, t: number): number {
    const ar = (a >> 16) & 0xff;
    const ag = (a >> 8) & 0xff;
    const ab = a & 0xff;
    const br = (b >> 16) & 0xff;
    const bg = (b >> 8) & 0xff;
    const bb = b & 0xff;
    const r = (ar + (br - ar) * t + 0.5) | 0;
    const g = (ag + (bg - ag) * t + 0.5) | 0;
    const bl = (ab + (bb - ab) * t + 0.5) | 0;
    return ((r << 16) | (g << 8) | bl) >>> 0;
}

/** Compatible materials share one caustics/displacement render pass. */
export function waterFxProfileKey(model: OceanGroundModelDef): string {
    return JSON.stringify({
        textures: model.textures,
        tint: model.causticTint,
        displacement: model.displacement,
        shoreOvershoot: model.shoreOvershoot,
        surfaceLayer: model.surfaceLayer,
        organicColor: model.edge === "organic" ? model.color : undefined,
    });
}

/**
 * Multiplier on ocean DisplacementFilter scale (and air-ring counter-nudge).
 * Pond refraction is stronger — keep createOceanGround in sync with this.
 */
export function waterDisplaceStrength(model: OceanGroundModelDef): number {
    return model.displacement.strength;
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
    const hasOrganicEdge = model.edge === "organic";
    const strength = waterDisplaceStrength(model);
    const displacement = {
        strength,
        scroll: model.displacement.scroll,
        world: model.displacement.worldScale,
    };
    const materialColor = parseHexColor(model.color);
    let waterModelIds: ReadonlySet<string> = new Set([model.id]);
    const organicFill = new Sprite(Texture.EMPTY);
    if (hasOrganicEdge) root.addChild(organicFill);

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

    /** Fade effects over the same boundary that owns the visible water fill. */
    const fxMask = new Sprite(
        hasOrganicEdge ? Texture.EMPTY : Texture.WHITE
    );
    if (!hasOrganicEdge) {
        fxMask.position.set(bounds.x, bounds.y);
        fxMask.width = bounds.width;
        fxMask.height = bounds.height;
    }
    root.addChild(fxMask);
    // A Sprite selects Pixi's AlphaMask path; Container masks are stencil-only.
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

    /**
     * Wave-shaped caustics pass: same scroll/tint as main FX, but AlphaMasked
     * by foam merge coverage so the overlay washes onto land with the waves.
     */
    const waveFx = new Container();
    waveFx.visible = false;
    root.addChild(waveFx);
    const waveMask = new Sprite(Texture.EMPTY);
    // Keep in the tree for AlphaMask sampling; empty/unused stays invisible.
    root.addChild(waveMask);
    waveFx.setMask({ mask: waveMask, channel: "alpha" });
    const waveCausticsA = new TilingSprite({
        texture: causticsTex,
        width: 1,
        height: 1,
    });
    waveCausticsA.blendMode = "add";
    waveFx.addChild(waveCausticsA);
    const waveCausticsB = new TilingSprite({
        texture: causticsTex,
        width: 1,
        height: 1,
    });
    waveCausticsB.blendMode = "add";
    waveFx.addChild(waveCausticsB);

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

    // The air ring should follow ambient swell, but not the sharp movement
    // wakes emitted directly beneath it.
    const anchoredMapRt = RenderTexture.create({
        width: 64,
        height: 64,
        dynamic: true,
    });
    const anchoredMapSprite = new Sprite(anchoredMapRt);
    anchoredMapSprite.renderable = false;
    root.addChild(anchoredMapSprite);

    const displaceFilter = new DisplacementFilter({
        sprite: mapSprite,
        scale: oceanFx.displaceStrength,
        padding: 80,
        resolution: 0.75,
    });
    fx.filters = [displaceFilter];
    // Keep displacement inside the shore-masked container so the water alpha
    // is the final clip, including pixels moved by the filter.
    const anchoredFx = new Container();
    const anchoredContent = new Container();
    anchoredFx.addChild(anchoredContent);
    const anchoredMask = new Sprite(
        hasOrganicEdge ? Texture.EMPTY : Texture.WHITE
    );
    if (!hasOrganicEdge) {
        anchoredMask.position.set(bounds.x, bounds.y);
        anchoredMask.width = bounds.width;
        anchoredMask.height = bounds.height;
    }
    root.addChild(anchoredFx, anchoredMask);
    anchoredFx.setMask({ mask: anchoredMask, channel: "alpha" });
    const anchoredMaskBind: NearshoreBindState = {};
    const anchoredDisplace = new AnchoredDisplacementFilter(
        anchoredMapSprite,
        oceanFx.displaceStrength * strength
    );
    anchoredDisplace.padding = 80;
    anchoredContent.filters = [anchoredDisplace];
    let organicMaskTexture: Texture | undefined;
    let organicFillTexture: Texture | undefined;

    const setOrganicMaskBounds = (waterBounds: readonly Rectangle[]) => {
        if (!hasOrganicEdge) return;
        fxMask.texture = Texture.EMPTY;
        anchoredMask.texture = Texture.EMPTY;
        organicFill.texture = Texture.EMPTY;
        organicMaskTexture?.destroy(true);
        organicFillTexture?.destroy(true);
        organicMaskTexture = undefined;
        organicFillTexture = undefined;

        const bounds = waterBounds.map((waterBoundsPx) => ({
                x: waterBoundsPx.x / TILE_SIZE,
                y: waterBoundsPx.y / TILE_SIZE,
                w: waterBoundsPx.width / TILE_SIZE,
                h: waterBoundsPx.height / TILE_SIZE,
            }));
        const baked = bakeOrganicRectMask(
            bounds,
            { amplitude: POND_SEAM_AMPLITUDE, offset: seamOffsetPond },
            ORGANIC_EDGE_SUBDIV,
            ORGANIC_EDGE_TEXTURE_MAX,
            { x: 0, y: 0, w: WORLD_TILES, h: WORLD_TILES },
            ORGANIC_FX_OVERSHOOT_TILES,
            0xffffff,
            materialColor
        );
        if (!baked?.fillTexture) return;
        organicMaskTexture = baked.texture;
        organicFillTexture = baked.fillTexture;
        organicFill.texture = baked.fillTexture;
        organicFill.position.set(baked.x * TILE_SIZE, baked.y * TILE_SIZE);
        organicFill.width = baked.w * TILE_SIZE;
        organicFill.height = baked.h * TILE_SIZE;
        for (const maskSprite of [fxMask, anchoredMask]) {
            maskSprite.texture = baked.texture;
            maskSprite.position.set(
                baked.x * TILE_SIZE,
                baked.y * TILE_SIZE
            );
            maskSprite.width = baked.w * TILE_SIZE;
            maskSprite.height = baked.h * TILE_SIZE;
        }
    };

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
        /** Surge wash (shore wave band). Omit for ballistic mover splashes. */
        originX?: number;
        originY?: number;
        dirX?: number;
        dirY?: number;
        surgeDistance?: number;
        surgeApexAt?: number;
        retreating?: boolean;
        blockedAt?: (
            x: number,
            y: number,
            hitRadius?: number
        ) => ParticleBlockHit | undefined;
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

    /** Shore-wave rear band: droplet refraction that surges with the foam. */
    const addSplashWash = (
        spawn: WaveSplashSpawn,
        now: number,
        blockedAt?: (
            x: number,
            y: number,
            hitRadius?: number
        ) => ParticleBlockHit | undefined
    ) => {
        if (splashes.length >= oceanFx.splash.max) return;
        const dirX = Math.cos(spawn.direction);
        const dirY = Math.sin(spawn.direction);
        splashes.push({
            x: spawn.x,
            y: spawn.y,
            born: now,
            updatedAt: now,
            velocityX: 0,
            velocityY: 0,
            lifetime: spawn.lifetime,
            startSize: spawn.startSize,
            peakSize: spawn.startSize * 1.12,
            rotation: Math.random() * Math.PI * 2,
            originX: spawn.x,
            originY: spawn.y,
            dirX,
            dirY,
            surgeDistance: spawn.surgeDistance,
            surgeApexAt: spawn.apexAt,
            blockedAt,
        });
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
        if (anchoredMapRt.width !== rtW || anchoredMapRt.height !== rtH) {
            anchoredMapRt.resize(rtW, rtH);
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
        swellBig.tileScale.set(
            (swell.big.world * displacement.world * scale) / texW
        );
        swellSmall.tileScale.set(
            (swell.small.world * displacement.world * scale) / texW
        );
        swellBig.tilePosition.set(
            (scrollDx - overlayX) * scale,
            (scrollDy - overlayY) * scale
        );
        swellSmall.tilePosition.set(
            (scrollD2x - overlayX) * scale,
            (scrollD2y - overlayY) * scale
        );

        for (const sprite of wakeSprites) sprite.visible = false;
        renderer.render({
            container: bake,
            target: anchoredMapRt,
            clear: true,
            clearColor: { r: 0.5, g: 0.5, b: 0.5, a: 1 },
        });
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
        anchoredMapSprite.texture = anchoredMapRt;
        anchoredMapSprite.position.set(overlayX, overlayY);
        anchoredMapSprite.width = overlayW;
        anchoredMapSprite.height = overlayH;
        const zoom = Math.hypot(fx.worldTransform.a, fx.worldTransform.b);
        const strength =
            displaceStrength *
            displacement.strength *
            Math.max(0.001, zoom);
        displaceFilter.scale.x = strength;
        displaceFilter.scale.y = strength;
        anchoredDisplace.scale = strength;
        const padding = Math.ceil(strength + 8);
        if (Math.abs(padding - displaceFilter.padding) >= 2) {
            displaceFilter.padding = padding;
        }
        // Center-relative correction can span both sides of the displacement
        // range. Keep the transparent input boundary comfortably beyond the
        // ring instead of letting displaced samples reach the filter edge.
        const anchoredPadding = Math.ceil(strength * 2 + 64);
        if (Math.abs(anchoredPadding - anchoredDisplace.padding) >= 2) {
            anchoredDisplace.padding = anchoredPadding;
        }

        for (const sprite of splashSprites) sprite.visible = false;
        for (let i = 0; i < splashes.length; i++) {
            const entry = splashes[i];
            if (!entry) continue;
            const deltaSeconds = Math.max(0, now - entry.updatedAt) / 1000;
            entry.updatedAt = now;

            if (entry.surgeDistance !== undefined) {
                const progress = (now - entry.born) / entry.lifetime;
                const apexAt = entry.surgeApexAt ?? 0.45;
                const originX = entry.originX ?? entry.x;
                const originY = entry.originY ?? entry.y;
                const dirX = entry.dirX ?? 0;
                const dirY = entry.dirY ?? 0;

                if (entry.retreating) {
                    const travel = surgeRetreatTravel(progress);
                    entry.x = originX + dirX * entry.surgeDistance * travel;
                    entry.y = originY + dirY * entry.surgeDistance * travel;
                } else {
                    const along = surgeAlong(progress, apexAt);
                    entry.x = originX + dirX * entry.surgeDistance * along;
                    entry.y = originY + dirY * entry.surgeDistance * along;

                    const hitRadius = entry.startSize * 0.45;
                    const hit =
                        progress > 0.06 && progress < apexAt
                            ? entry.blockedAt?.(entry.x, entry.y, hitRadius)
                            : undefined;
                    if (hit) {
                        const retreat = surgeRetreatFromHit(
                            entry.x,
                            entry.y,
                            hit.nx,
                            hit.ny,
                            along,
                            entry.surgeDistance,
                            apexAt,
                            entry.lifetime,
                            -dirX,
                            -dirY
                        );
                        entry.originX = retreat.originX;
                        entry.originY = retreat.originY;
                        entry.dirX = retreat.dirX;
                        entry.dirY = retreat.dirY;
                        entry.surgeDistance = retreat.surgeDistance;
                        entry.retreating = true;
                        entry.born = now;
                        entry.lifetime = retreat.lifetime;
                        entry.blockedAt = undefined;
                        entry.velocityX = 0;
                        entry.velocityY = 0;
                        entry.peakSize = undefined;
                    }
                }
            } else {
                const friction = Math.exp(-splash.friction * deltaSeconds);
                entry.velocityX *= friction;
                entry.velocityY *= friction;
                entry.x += entry.velocityX * deltaSeconds;
                entry.y += entry.velocityY * deltaSeconds;
            }

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
                entry.surgeApexAt ?? splash.peakAt
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
    /** Waves left in the current surf set (0 = start a new set next). */
    let wavesLeftInSet = 0;
    /** Keep successive set waves on the same stretch of shore. */
    let waveFocus: ShoreSample | undefined;

    /** Prefer a nearby same-facing shore sample so sets read as one surf line. */
    const pickWaveShore = (
        shores: readonly ShoreSample[]
    ): ShoreSample | undefined => {
        if (shores.length === 0) return undefined;
        const focus = waveFocus;
        if (!focus) {
            return shores[Math.floor(Math.random() * shores.length)];
        }
        const maxDist = 520;
        const maxDist2 = maxDist * maxDist;
        let best: ShoreSample | undefined;
        let bestScore = Infinity;
        for (const sample of shores) {
            // Same oceanward facing (axis-aligned shores share normals).
            if (sample.nx !== focus.nx || sample.ny !== focus.ny) continue;
            const dx = sample.x - focus.x;
            const dy = sample.y - focus.y;
            const d2 = dx * dx + dy * dy;
            if (d2 > maxDist2 || d2 < 40 * 40) continue;
            const score = d2 + Math.random() * 80 * 80;
            if (score < bestScore) {
                bestScore = score;
                best = sample;
            }
        }
        return best ?? shores[Math.floor(Math.random() * shores.length)];
    };

    const setOverlay = (x: number, y: number, w: number, h: number) => {
        causticsA.position.set(x, y);
        causticsA.width = w;
        causticsA.height = h;
        causticsB.position.set(x, y);
        causticsB.width = w;
        causticsB.height = h;
        waveCausticsA.position.set(x, y);
        waveCausticsA.width = w;
        waveCausticsA.height = h;
        waveCausticsB.position.set(x, y);
        waveCausticsB.width = w;
        waveCausticsB.height = h;
    };

    const syncWaveMask = (
        wave?: GroundUpdateContext["waveMask"]
    ): void => {
        if (!wave || wave.width < 1 || wave.height < 1) {
            waveFx.visible = false;
            waveMask.texture = Texture.EMPTY;
            return;
        }
        waveMask.texture = wave.texture;
        waveMask.position.set(wave.x, wave.y);
        waveMask.width = wave.width;
        waveMask.height = wave.height;
        waveFx.visible = true;
    };

    const syncOverlay = (view: GroundViewBounds) => {
        const overshoot =
            oceanFx.displaceStrength * displacement.strength + 40;
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
            waveFx.visible = false;
            anchoredFx.visible = false;
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
        // An empty filtered container produces an opaque black intermediate in
        // Pixi. The air ring is the only anchored child, so skip this pass while
        // it is hidden instead of filtering an empty render texture.
        anchoredFx.visible = anchoredContent.children.some(
            (child) => child.visible && child.renderable && child.alpha > 0
        );
        return true;
    };

    return {
        container: root,
        overlay: splashOverlay,
        /** Displace-filtered + shore-masked layer — parent underwater overlays here. */
        fxLayer: fx,
        anchoredFxLayer: anchoredContent,
        setFxAnchor(worldX, worldY) {
            if (overlayW <= 0 || overlayH <= 0) return;
            anchoredDisplace.anchorUv = {
                x: Math.min(1, Math.max(0, (worldX - overlayX) / overlayW)),
                y: Math.min(1, Math.max(0, (worldY - overlayY) / overlayH)),
            };
            anchoredDisplace.anchorStep = {
                x: ANCHORED_DISPLACE_SAMPLE_RADIUS / overlayW,
                y: ANCHORED_DISPLACE_SAMPLE_RADIUS / overlayH,
            };
        },
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
        setWaterModelIds(modelIds) {
            waterModelIds = modelIds;
        },
        setWaterBounds(waterBounds) {
            setOrganicMaskBounds(waterBounds);
        },
        update(ctx: GroundUpdateContext) {
            const cfg = oceanFx;
            const { a, b } = cfg.caustics;
            const tint = model.causticTint;
            let tintA = oceanTint(tint?.a ?? a.tint);
            let tintB = oceanTint(tint?.b ?? b.tint);
            let alphaA = a.alpha;
            let alphaB = b.alpha;
            if (hasOrganicEdge) {
                // Pull additive overlays toward pond blue so they read on the fill.
                tintA = mixRgb(tintA, materialColor, 0.45);
                tintB = mixRgb(tintB, materialColor, 0.35);
                alphaA *= 1.35;
                alphaB *= 1.35;
            }
            causticsA.tint = tintA;
            causticsA.alpha = alphaA;
            causticsA.tileScale.set(a.tileScale);
            causticsB.tint = tintB;
            causticsB.alpha = alphaB;
            causticsB.tileScale.set(b.tileScale);
            // Slightly hotter on the wave pass so beach wash reads clearly.
            waveCausticsA.tint = tintA;
            waveCausticsA.alpha = alphaA * 1.15;
            waveCausticsA.tileScale.set(a.tileScale);
            waveCausticsB.tint = tintB;
            waveCausticsB.alpha = alphaB * 1.15;
            waveCausticsB.tileScale.set(b.tileScale);

            if (!hasOrganicEdge) {
                bindNearshoreSprite(
                    fxMask,
                    bounds,
                    modelShoreMask ??
                        (model.shoreOvershoot ? ctx.shoreMask : Texture.EMPTY),
                    maskBind
                );
            }
            if (!hasOrganicEdge) {
                bindNearshoreSprite(
                    anchoredMask,
                    bounds,
                    modelShoreMask ??
                        (model.shoreOvershoot ? ctx.shoreMask : Texture.EMPTY),
                    anchoredMaskBind
                );
            }
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
            scrollDx += cfg.swell.big.scroll.x * displacement.scroll * sec;
            scrollDy += cfg.swell.big.scroll.y * displacement.scroll * sec;
            scrollD2x += cfg.swell.small.scroll.x * displacement.scroll * sec;
            scrollD2y += cfg.swell.small.scroll.y * displacement.scroll * sec;

            causticsA.tilePosition.set(
                worldTile(overlayX, scrollAx),
                worldTile(overlayY, scrollAy)
            );
            causticsB.tilePosition.set(
                worldTile(overlayX, scrollBx),
                worldTile(overlayY, scrollBy)
            );
            waveCausticsA.tilePosition.set(
                worldTile(overlayX, scrollAx),
                worldTile(overlayY, scrollAy)
            );
            waveCausticsB.tilePosition.set(
                worldTile(overlayX, scrollBx),
                worldTile(overlayY, scrollBy)
            );
            syncWaveMask(ctx.waveMask);

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
                waterModelIds.has(
                    ctx.waterModelAt?.(x, y) ??
                        (ctx.isOceanAt(x, y) ? model.id : "")
                );

            if (ctx.now >= nextFoamAt && visibleShores.length > 0) {
                if (wavesLeftInSet <= 0) {
                    // Sets of 2–4, like a real surf train.
                    wavesLeftInSet = 2 + ((Math.random() * 3) | 0);
                    waveFocus = undefined;
                }

                const sample = pickWaveShore(visibleShores);
                // Samples sit on the land lip — step into water to resolve model.
                if (
                    sample &&
                    onThisWater(
                        sample.x + sample.nx * 24,
                        sample.y + sample.ny * 24
                    )
                ) {
                    waveFocus = sample;
                    const wave = oceanWaveWash(
                        foamTex,
                        sample.x,
                        sample.y,
                        sample.nx,
                        sample.ny,
                        ctx.blockedAt
                    );
                    for (const burst of wave.foam) {
                        ctx.emitParticles(burst);
                    }
                    for (const spawn of wave.splashes) {
                        addSplashWash(spawn, ctx.now, ctx.blockedAt);
                    }
                }

                wavesLeftInSet--;
                const [lo, hi] = foamIntervalMs;
                if (wavesLeftInSet > 0) {
                    // Steady beat inside a set — slight jitter only.
                    const beat = lo + Math.random() * (hi - lo);
                    nextFoamAt = ctx.now + beat;
                } else {
                    // Longer lull between sets.
                    const lull =
                        lo * 2.2 + Math.random() * (hi - lo + lo * 0.6);
                    nextFoamAt = ctx.now + lull;
                    waveFocus = undefined;
                }
            }

            if (ctx.now >= nextSparkleAt) {
                const [lo, hi] = sparkleIntervalMs;
                const rate = Math.max(
                    0.05,
                    ambientRate(ctx.dayPeriod, "water_sparkle")
                );
                nextSparkleAt =
                    ctx.now + (lo + Math.random() * (hi - lo)) / rate;
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
        destroy() {
            // Unbind before destroy — pooled AlphaMaskPipe keeps the last
            // MaskFilter BindGroup and crashes if the shore source dies first.
            fx.mask = null;
            waveFx.mask = null;
            anchoredFx.mask = null;
            fx.filters = null;
            anchoredContent.filters = null;
            splashOverlay.filters = null;
            maskBind.map?.destroy(false);
            maskBind.map = undefined;
            maskBind.source = undefined;
            anchoredMaskBind.map?.destroy(false);
            anchoredMaskBind.map = undefined;
            anchoredMaskBind.source = undefined;
            organicMaskTexture?.destroy(true);
            organicMaskTexture = undefined;
            organicFillTexture?.destroy(true);
            organicFillTexture = undefined;
            mapRt.destroy(true);
            anchoredMapRt.destroy(true);
            splashRt.destroy(true);
            displaceFilter.destroy();
            anchoredDisplace.destroy();
            splashFilter.destroy();
            root.destroy({ children: true });
            splashOverlay.destroy({ children: true });
        },
    };
}

/** Ocean color fill for one authored ground rectangle. */
export function createOceanFill(
    model: OceanGroundModelDef,
    bounds: Rectangle,
    zIndex: number
): GroundVisual {
    if (model.edge === "organic") {
        const fill = new Container();
        fill.zIndex = zIndex;
        return { container: fill };
    }

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
        destroy() {
            bind.map?.destroy(false);
            bind.map = undefined;
            bind.source = undefined;
            fill.destroy();
        },
    };
}
