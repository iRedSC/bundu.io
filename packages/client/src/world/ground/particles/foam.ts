import type { Texture } from "pixi.js";
import type { ParticleBurst } from "../../../rendering/particles/types";

const FOAM_TINTS = [0xe8f4ff, 0xffffff, 0xcfe8f8] as const;
/** 70% ocean base (#1a5f8a) + 30% white. */
const SPLASH_TINT = 0x5f8fad;
/** 100° forward cone (full width, radians). */
const SPLASH_SPREAD = (100 * Math.PI) / 180;

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
        lifetime: [600, 1100],
        size: [18, 42],
        endSize: 4,
        friction: 0.55,
        tint: FOAM_TINTS[Math.floor(Math.random() * FOAM_TINTS.length)],
        blendMode: "screen",
        zIndex: GROUND_PARTICLE_Z,
    };
}

/** Foam/splash burst from a mover's center, flung forward. */
export function oceanSplash(
    texture: Texture,
    x: number,
    y: number,
    direction: number,
    /** World units / second — particle speed is 1.8–2.2× this. */
    speed: number
): ParticleBurst {
    const lo = Math.max(20, speed * 1.8);
    const hi = Math.max(lo + 1, speed * 2.2);
    return {
        texture,
        x,
        y,
        direction,
        count: 6 + ((Math.random() * 3) | 0),
        spread: SPLASH_SPREAD,
        speed: [lo, hi],
        lifetime: [450, 750],
        size: [52, 96],
        endSize: 14,
        friction: 4.5,
        tint: SPLASH_TINT,
        blendMode: "normal",
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

/** Above ground fills, below decorations/entities. */
export const GROUND_PARTICLE_Z = -500_000_000;
