import type { Texture } from "pixi.js";
import { TILE_SIZE } from "@bundu/shared/tiles";
import type {
    ParticleBlockHit,
    ParticleBurst,
} from "../../../rendering/particles/types";
import { GROUND_Z_OCEAN } from "../create";

const FOAM_TINTS = [0xe8f4ff, 0xffffff, 0xcfe8f8] as const;

const pickTint = (tints: readonly number[]): number =>
    tints[Math.floor(Math.random() * tints.length)] ?? 0xffffff;

/** Footsteps / trails / sparkles — above ocean FX, below entities. */
export const GROUND_PARTICLE_Z = -5;

/**
 * Visible shore foam. Above ocean FX (`GROUND_Z_OCEAN`), below admin grid (-1)
 * and entities/players (0+).
 */
export const FOAM_PARTICLE_Z = GROUND_Z_OCEAN + 1;

/** Spawn distance offshore from the shore lip. */
const WAVE_OFFSHORE = TILE_SIZE * 4;
/** How far past the shore lip the wash runs inland. */
const WAVE_OVERSHOOT = TILE_SIZE * 4;
/** Total surge travel: offshore → overshoot apex. */
const WAVE_TRAVEL = WAVE_OFFSHORE + WAVE_OVERSHOOT;

/** One droplet in the refractive splash wash line behind the foam. */
export type WaveSplashSpawn = {
    x: number;
    y: number;
    /** Inland (toward shore). */
    direction: number;
    surgeDistance: number;
    lifetime: number;
    apexAt: number;
    startSize: number;
};

export type WaveWashGroup = {
    foam: ParticleBurst[];
    /**
     * Invisible coverage particles — AlphaMask the ocean overlay. Sprayed at
     * many speeds so they fill the band up to the foam front.
     */
    overlay: ParticleBurst[];
    /** Real splash-displacement droplets (not ParticleSystem sprites). */
    splashes: WaveSplashSpawn[];
};

/**
 * One shoreline wave group: foam sprites in front, overlay-mask fill behind,
 * refractive splash droplets. Foam/overlay use ParticleSystem; splash uses the
 * ocean splash-displacement bake.
 */
export function oceanWaveWash(
    foamTexture: Texture,
    shoreX: number,
    shoreY: number,
    nx: number,
    ny: number,
    blockedAt?: (
        x: number,
        y: number,
        hitRadius: number
    ) => ParticleBlockHit | undefined
): WaveWashGroup {
    // Normal points oceanward; wash travels the opposite way onto land.
    const inland = Math.atan2(-ny, -nx);
    const tx = -ny;
    const ty = nx;

    // ~4× the original band length, with denser samples to match.
    const bandWidth = 360 + Math.random() * 280;
    const count = 14 + ((Math.random() * 7) | 0);
    const foam: ParticleBurst[] = [];
    const overlay: ParticleBurst[] = [];
    const splashes: WaveSplashSpawn[] = [];

    const foamApex = 0.38;
    // Slow wash across the 8-tile surge path.
    const foamLife: readonly [number, number] = [9000, 12_000];
    const foamSize: readonly [number, number] = [48, 88];
    const foamTint = pickTint(FOAM_TINTS);

    for (let i = 0; i < count; i++) {
        const across =
            count <= 1
                ? 0
                : (i / (count - 1) - 0.5) * bandWidth +
                  (Math.random() - 0.5) * 18;
        const alongJitter = (Math.random() - 0.5) * 16;
        const distance = WAVE_TRAVEL + (Math.random() - 0.5) * TILE_SIZE * 0.4;
        foam.push({
            texture: foamTexture,
            x: shoreX + nx * (WAVE_OFFSHORE + alongJitter) + tx * across,
            y: shoreY + ny * (WAVE_OFFSHORE + alongJitter) + ty * across,
            direction: inland,
            count: 1,
            spread: 0.08,
            speed: 0,
            lifetime: foamLife,
            size: foamSize,
            endSize: 0,
            peakSize: [foamSize[0] * 1.05, foamSize[1] * 1.15],
            peakAt: foamApex,
            motion: {
                kind: "surge",
                distance,
                apexAt: foamApex,
            },
            blockedAt,
            tint: foamTint,
            // Opaque coverage; merge sprite stays fully opaque.
            alpha: 1,
            alphaFadeIn: 0,
            alphaHold: 1,
            mergeAlpha: 1,
            blendMode: "normal",
            spin: [-0.2, 0.2],
            spinFriction: 0.8,
            zIndex: FOAM_PARTICLE_Z,
        });
    }

    // Overlay mask fill: denser, larger, many speeds — covers up to the foam.
    const overlayCount = count * 3 + ((Math.random() * 6) | 0);
    for (let i = 0; i < overlayCount; i++) {
        const across =
            (Math.random() - 0.5) * bandWidth + (Math.random() - 0.5) * 28;
        // 0 = near foam front, 1 = further offshore behind it.
        const depth = Math.random();
        const behind = depth * TILE_SIZE * 2.8;
        const offshore = WAVE_OFFSHORE + behind + (Math.random() - 0.5) * 20;
        // Faster near the foam, slower deeper — fills the band as they surge.
        const speedBias = 1 - depth * 0.75 + (Math.random() - 0.5) * 0.2;
        const lifetime = 6500 + (1 - speedBias) * 7000 + Math.random() * 1800;
        const apexAt = 0.3 + (1 - speedBias) * 0.2;
        const distance =
            offshore +
            WAVE_OVERSHOOT * (0.55 + speedBias * 0.5) +
            (Math.random() - 0.5) * 40;
        const size = 72 + Math.random() * 90;
        overlay.push({
            texture: foamTexture,
            x: shoreX + nx * offshore + tx * across,
            y: shoreY + ny * offshore + ty * across,
            direction: inland + (Math.random() - 0.5) * 0.14,
            count: 1,
            spread: 0.1,
            speed: 0,
            lifetime,
            size,
            endSize: 0,
            peakSize: size * (1.05 + Math.random() * 0.15),
            peakAt: apexAt,
            motion: {
                kind: "surge",
                distance,
                apexAt,
            },
            blockedAt,
            tint: 0xffffff,
            alpha: 1,
            alphaFadeIn: 0,
            alphaHold: 1,
            mergeMask: true,
            blendMode: "normal",
            spin: [-0.15, 0.15],
            spinFriction: 0.9,
            zIndex: GROUND_PARTICLE_Z,
        });
    }

    // Splash line sits behind the foam and moves a bit slower.
    const splashBehind = TILE_SIZE * 0.55 + Math.random() * TILE_SIZE * 0.35;
    const splashOffshore = WAVE_OFFSHORE + splashBehind;
    const splashApex = 0.48;
    for (let i = 0; i < count; i++) {
        const across =
            count <= 1
                ? 0
                : (i / (count - 1) - 0.5) * bandWidth +
                  (Math.random() - 0.5) * 20;
        const alongJitter = (Math.random() - 0.5) * 18;
        splashes.push({
            x: shoreX + nx * (splashOffshore + alongJitter) + tx * across,
            y: shoreY + ny * (splashOffshore + alongJitter) + ty * across,
            direction: inland + (Math.random() - 0.5) * 0.1,
            surgeDistance:
                splashOffshore + WAVE_OVERSHOOT + (Math.random() - 0.5) * 40,
            lifetime: 11_000 + Math.random() * 3000,
            apexAt: splashApex,
            startSize: 70 + Math.random() * 50,
        });
    }

    return { foam, overlay, splashes };
}

/** Tiny specular sparkles on open water. */
export function oceanSparkle(
    texture: Texture,
    x: number,
    y: number
): ParticleBurst {
    return {
        texture,
        x,
        y,
        direction: -Math.PI / 2,
        count: 1,
        spread: Math.PI * 2,
        speed: [2, 8],
        lifetime: [280, 550],
        size: [8, 18],
        endSize: 2,
        friction: 0.2,
        tint: 0xffffff,
        blendMode: "add",
        zIndex: GROUND_PARTICLE_Z,
    };
}
