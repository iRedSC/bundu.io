import type { Texture } from "pixi.js";
import type { ParticleBurst } from "../../../rendering/particles/types";

const FOAM_TINTS = [0xe8f4ff, 0xffffff, 0xcfe8f8] as const;

/** Soft whitecap foam along shorelines. */
export function oceanFoam(
    texture: Texture,
    x: number,
    y: number,
    direction: number
): ParticleBurst {
    return {
        texture,
        x: x + (Math.random() - 0.5) * 18,
        y: y + (Math.random() - 0.5) * 18,
        direction,
        count: 1,
        spread: 0.9,
        speed: [4, 18],
        lifetime: [900, 1800],
        size: [28, 70],
        endSize: 6,
        friction: 0.55,
        tint: FOAM_TINTS[Math.floor(Math.random() * FOAM_TINTS.length)],
        blendMode: "screen",
        zIndex: GROUND_PARTICLE_Z,
    };
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
        speed: [2, 10],
        lifetime: [400, 900],
        size: [10, 28],
        endSize: 2,
        friction: 0.2,
        tint: 0xffffff,
        blendMode: "add",
        zIndex: GROUND_PARTICLE_Z,
    };
}

/** Above ground fills, below decorations/entities. */
export const GROUND_PARTICLE_Z = -500_000_000;
