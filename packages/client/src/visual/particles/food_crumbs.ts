import type { Texture } from "pixi.js";
import type { ParticleBurst } from "../../rendering/particles/types";

export function foodCrumbs(texture: Texture, x: number, y: number): ParticleBurst {
    return {
        texture,
        x,
        y,
        direction: -Math.PI / 2,
        count: 2,
        spread: Math.PI / 3,
        speed: [20, 45],
        lifetime: [250, 450],
        size: [4, 7],
        endSize: 1,
        gravity: 100,
        friction: 3,
    };
}
