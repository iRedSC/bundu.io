import type { Texture } from "pixi.js";
import type { ParticleBurst } from "../../../rendering/particles/types";

const FOAM_TINTS = [0xe8f4ff, 0xffffff, 0xcfe8f8] as const;
const SPLASH_TINTS = [0xb8dce8, 0xd0e8f0, 0x9ec8d8] as const;

const pickTint = (tints: readonly number[]): number =>
    tints[Math.floor(Math.random() * tints.length)] ?? 0xffffff;

/** Above ocean ground (-10), below admin grid (-1) and entities (0+). */
export const GROUND_PARTICLE_Z = -5;

type WaveLayer = {
    texture: Texture;
    /** Extra offshore offset behind the leading foam line (world px). */
    behind: number;
    /** Surge travel distance toward shore. */
    distance: readonly [number, number];
    lifetime: readonly [number, number];
    size: readonly [number, number];
    endSize: number;
    apexAt: number;
    alpha: number;
    alphaFadeIn: number;
    alphaHold: number;
    tint: number;
    blendMode: "screen" | "add";
};

/**
 * One shoreline wave group: a band of foam in front and splash (displace)
 * behind it. Particles fade in offshore, surge onto the lip, then retreat.
 * `blockedAt` makes particles that strike land/objects spray back and fade.
 */
export function oceanWaveWash(
    foamTexture: Texture,
    splashTexture: Texture,
    shoreX: number,
    shoreY: number,
    nx: number,
    ny: number,
    blockedAt?: (x: number, y: number) => boolean
): ParticleBurst[] {
    // Normal points oceanward; wash travels the opposite way onto land.
    const inland = Math.atan2(-ny, -nx);
    const tx = -ny;
    const ty = nx;

    const bandWidth = 90 + Math.random() * 70;
    const count = 4 + ((Math.random() * 3) | 0);
    const foamOffshore = 48 + Math.random() * 18;
    const bursts: ParticleBurst[] = [];

    const layers: WaveLayer[] = [
        {
            texture: foamTexture,
            behind: 0,
            distance: [foamOffshore + 6, foamOffshore + 28],
            lifetime: [2000, 2800],
            size: [56, 110],
            endSize: 22,
            apexAt: 0.38,
            alpha: 0.85,
            alphaFadeIn: 0.12,
            alphaHold: 0.55,
            tint: pickTint(FOAM_TINTS),
            blendMode: "screen",
        },
        {
            texture: splashTexture,
            behind: 28 + Math.random() * 18,
            distance: [foamOffshore + 10, foamOffshore + 36],
            lifetime: [2600, 3600],
            size: [70, 130],
            endSize: 28,
            apexAt: 0.48,
            alpha: 0.55,
            alphaFadeIn: 0.18,
            alphaHold: 0.5,
            tint: pickTint(SPLASH_TINTS),
            blendMode: "screen",
        },
    ];

    for (const layer of layers) {
        const offshore = foamOffshore + layer.behind;
        for (let i = 0; i < count; i++) {
            const across =
                count <= 1
                    ? 0
                    : ((i / (count - 1)) - 0.5) * bandWidth +
                      (Math.random() - 0.5) * 14;
            const alongJitter = (Math.random() - 0.5) * 10;
            bursts.push({
                texture: layer.texture,
                x: shoreX + nx * (offshore + alongJitter) + tx * across,
                y: shoreY + ny * (offshore + alongJitter) + ty * across,
                direction: inland,
                count: 1,
                spread: 0.12,
                speed: 0,
                lifetime: layer.lifetime,
                size: layer.size,
                endSize: layer.endSize,
                peakSize: [
                    layer.size[0] * 1.05,
                    layer.size[1] * 1.15,
                ],
                peakAt: layer.apexAt,
                motion: {
                    kind: "surge",
                    distance: layer.distance,
                    apexAt: layer.apexAt,
                },
                blockedAt,
                tint: layer.tint,
                alpha: layer.alpha,
                alphaFadeIn: layer.alphaFadeIn,
                alphaHold: layer.alphaHold,
                blendMode: layer.blendMode,
                spin: [-0.4, 0.4],
                spinFriction: 0.8,
                zIndex: GROUND_PARTICLE_Z,
            });
        }
    }

    return bursts;
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
