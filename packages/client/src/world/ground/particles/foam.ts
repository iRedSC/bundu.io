import type { Texture } from "pixi.js";
import { TILE_SIZE } from "@bundu/shared/tiles";
import type { ParticleBurst } from "../../../rendering/particles/types";

const FOAM_TINTS = [0xe8f4ff, 0xffffff, 0xcfe8f8] as const;

const pickTint = (tints: readonly number[]): number =>
    tints[Math.floor(Math.random() * tints.length)] ?? 0xffffff;

/** Above ocean ground (-10), below admin grid (-1) and entities (0+). */
export const GROUND_PARTICLE_Z = -5;

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
    /** Real splash-displacement droplets (not ParticleSystem sprites). */
    splashes: WaveSplashSpawn[];
};

/**
 * One shoreline wave group: foam sprites in front, refractive splash droplets
 * behind. Both surge offshore → shore → back; foam uses ParticleSystem, splash
 * uses the ocean splash-displacement bake.
 */
export function oceanWaveWash(
    foamTexture: Texture,
    shoreX: number,
    shoreY: number,
    nx: number,
    ny: number,
    blockedAt?: (x: number, y: number, hitRadius: number) => boolean
): WaveWashGroup {
    // Normal points oceanward; wash travels the opposite way onto land.
    const inland = Math.atan2(-ny, -nx);
    const tx = -ny;
    const ty = nx;

    // ~4× the original band length, with denser samples to match.
    const bandWidth = 360 + Math.random() * 280;
    const count = 14 + ((Math.random() * 7) | 0);
    const foam: ParticleBurst[] = [];
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
            // Opaque coverage; mergeAlpha applies one shared transparency pass.
            alpha: 1,
            alphaFadeIn: 0,
            alphaHold: 1,
            mergeAlpha: 0.3,
            blendMode: "normal",
            spin: [-0.2, 0.2],
            spinFriction: 0.8,
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

    return { foam, splashes };
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
