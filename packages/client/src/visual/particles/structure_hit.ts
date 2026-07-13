import type { ParticleBurst } from "../../rendering/particles/types";
import type { Texture } from "pixi.js";

export function structureHit(
    texture: Texture,
    x: number,
    y: number,
    direction: number
): ParticleBurst {
    return {
        texture,
        x,
        y,
        direction,
        count: 3,
        spread: Math.PI / 2,
        speed: [300, 600],
        lifetime: [2000, 3000],
        size: [20, 30],
        endSize: 10,
        gravity: 0,
        friction: 3,
        motionEndAt: 0.3,

        spin: [-20, 15],
        spinFriction: 4,
        spinEndAt: 0.3,

        sizeEndAt: 0.4,
    };
}
