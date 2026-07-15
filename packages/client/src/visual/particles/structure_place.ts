import type { Texture } from "pixi.js";
import type { ParticleBurst } from "../../rendering/particles/types";

/** Short burst when a structure pops into the world. */
export function structurePlace(
    texture: Texture,
    x: number,
    y: number
): ParticleBurst {
    return {
        texture,
        x,
        y,
        direction: -Math.PI / 2,
        count: 6,
        spread: Math.PI,
        speed: [80, 220],
        lifetime: [250, 450],
        size: [8, 16],
        endSize: 2,
        gravity: 400,
        friction: 2,
        spin: [-25, 25],
        spinFriction: 4,
    };
}
