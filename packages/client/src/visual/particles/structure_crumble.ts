import type { Texture } from "pixi.js";
import type { ParticleBurst } from "../../rendering/particles/types";

/** Sparse debris that makes a rotting structure feel unstable. */
export function structureCrumble(
    texture: Texture,
    x: number,
    y: number,
    radius: number
): ParticleBurst {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * radius;
    return {
        texture,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        direction: Math.PI / 2,
        count: 2,
        spread: Math.PI / 2,
        speed: [20, 80],
        lifetime: [700, 1_200],
        size: [5, 10],
        endSize: 2,
        gravity: 300,
        friction: 2,
        spin: [-8, 8],
        spinFriction: 3,
    };
}
