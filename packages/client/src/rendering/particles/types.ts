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
    /** Vertical acceleration (positive = down). */
    gravity?: number;
    /** Horizontal acceleration (positive = right). */
    gravityX?: number;
    friction?: number;
    motionEndAt?: number;
    spin?: NumberRange;
    spinFriction?: number;
    spinEndAt?: number;
    tint?: number;
    /** Start alpha. Defaults to 1. */
    alpha?: number;
    /**
     * Lifetime progress [0,1] before alpha begins fading to 0.
     * `0` = fade from spawn (default); `0.5` = hold then fade in the second half.
     */
    alphaHold?: number;
    blendMode?: "normal" | "add" | "screen";
    zIndex?: number;
};
