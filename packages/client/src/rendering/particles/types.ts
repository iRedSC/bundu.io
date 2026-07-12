import type { Texture } from "pixi.js";

export type NumberRange = number | readonly [min: number, max: number];

export type ParticleBurst = {
    texture: Texture;
    x: number;
    y: number;
    direction: number;
    count: number;
    spread?: number;
    speed: NumberRange;
    lifetime: NumberRange;
    size: NumberRange;
    endSize?: number;
    sizeEndAt?: number;
    gravity?: number;
    friction?: number;
    motionEndAt?: number;
    spin?: NumberRange;
    spinFriction?: number;
    spinEndAt?: number;
};
