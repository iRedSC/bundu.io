import type { Texture } from "pixi.js";
import type { ParticleBurst } from "../../rendering/particles/types";

const FIRE_TINTS = [0xff6b2d, 0xff9a3c, 0xffc14a, 0xff4d2a, 0xffe08a] as const;

/** Soft rising embers for placed fires. */
export function fireGlow(texture: Texture, x: number, y: number): ParticleBurst {
    return {
        texture,
        x: x + (Math.random() - 0.5) * 28,
        y: y + (Math.random() - 0.5) * 12,
        direction: -Math.PI / 2,
        count: 1,
        spread: 0.7,
        speed: [12, 36],
        lifetime: [700, 1400],
        size: [40, 100],
        endSize: 4,
        gravity: -18,
        friction: 0.4,
        tint: FIRE_TINTS[Math.floor(Math.random() * FIRE_TINTS.length)],
        blendMode: "add",
        zIndex: 203,
    };
}
