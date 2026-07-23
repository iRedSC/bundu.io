import type { Texture } from "pixi.js";
import type { ParticleBurst } from "../../../rendering/particles/types";

const FOAM_TINTS = [0xe8f4ff, 0xffffff, 0xcfe8f8] as const;

const pickTint = (tints: readonly number[]): number =>
    tints[Math.floor(Math.random() * tints.length)] ?? 0xffffff;

/** Above ocean ground (-10), below admin grid (-1) and entities (0+). */
export const GROUND_PARTICLE_Z = -5;

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
    blockedAt?: (x: number, y: number) => boolean
): WaveWashGroup {
    // Normal points oceanward; wash travels the opposite way onto land.
    const inland = Math.atan2(-ny, -nx);
    const tx = -ny;
    const ty = nx;

    const bandWidth = 90 + Math.random() * 70;
    const count = 4 + ((Math.random() * 3) | 0);
    const foamOffshore = 48 + Math.random() * 18;
    const foam: ParticleBurst[] = [];
    const splashes: WaveSplashSpawn[] = [];

    const foamApex = 0.38;
    const foamDistance: readonly [number, number] = [
        foamOffshore + 6,
        foamOffshore + 28,
    ];
    const foamLife: readonly [number, number] = [2000, 2800];
    const foamSize: readonly [number, number] = [56, 110];
    const foamTint = pickTint(FOAM_TINTS);

    for (let i = 0; i < count; i++) {
        const across =
            count <= 1
                ? 0
                : (i / (count - 1) - 0.5) * bandWidth +
                  (Math.random() - 0.5) * 14;
        const alongJitter = (Math.random() - 0.5) * 10;
        const distance =
            foamDistance[0] +
            Math.random() * (foamDistance[1] - foamDistance[0]);
        foam.push({
            texture: foamTexture,
            x: shoreX + nx * (foamOffshore + alongJitter) + tx * across,
            y: shoreY + ny * (foamOffshore + alongJitter) + ty * across,
            direction: inland,
            count: 1,
            spread: 0.12,
            speed: 0,
            lifetime: foamLife,
            size: foamSize,
            endSize: 22,
            peakSize: [foamSize[0] * 1.05, foamSize[1] * 1.15],
            peakAt: foamApex,
            motion: {
                kind: "surge",
                distance,
                apexAt: foamApex,
            },
            blockedAt,
            tint: foamTint,
            alpha: 0.85,
            alphaFadeIn: 0.12,
            alphaHold: 0.55,
            blendMode: "screen",
            spin: [-0.4, 0.4],
            spinFriction: 0.8,
            zIndex: GROUND_PARTICLE_Z,
        });
    }

    // Splash line sits behind the foam and moves a bit slower.
    const splashBehind = 28 + Math.random() * 18;
    const splashOffshore = foamOffshore + splashBehind;
    const splashApex = 0.48;
    for (let i = 0; i < count; i++) {
        const across =
            count <= 1
                ? 0
                : (i / (count - 1) - 0.5) * bandWidth +
                  (Math.random() - 0.5) * 16;
        const alongJitter = (Math.random() - 0.5) * 12;
        splashes.push({
            x: shoreX + nx * (splashOffshore + alongJitter) + tx * across,
            y: shoreY + ny * (splashOffshore + alongJitter) + ty * across,
            direction: inland + (Math.random() - 0.5) * 0.12,
            surgeDistance: splashOffshore + 10 + Math.random() * 26,
            lifetime: 2600 + Math.random() * 1000,
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
