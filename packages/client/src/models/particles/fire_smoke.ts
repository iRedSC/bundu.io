import type { Texture } from "pixi.js";
import type { ParticleBurst } from "../../rendering/particles/types";

/** Soft gray smoke that drifts up, grows, and fades out. */
export function fireSmoke(
    texture: Texture,
    x: number,
    y: number
): ParticleBurst {
    const start = 50 + Math.random() * 30;
    return {
        texture,
        x: x + (Math.random() - 0.5) * 24,
        y: y + (Math.random() - 0.5) * 10,
        direction: -Math.PI / 2,
        count: 1,
        spread: 0.55,
        speed: [6, 16],
        lifetime: [3000, 4000],
        size: start,
        endSize: start + 50 + Math.random() * 50,
        gravity: -15 + Math.random() * -5,
        gravityX: 10 + Math.random() * 10,
        friction: 0.15,
        tint: 0xb0b0b0,
        blendMode: "normal",
        // Above sky multiply (200) so night tint doesn't erase the smoke.
        zIndex: 202,
    };
}
