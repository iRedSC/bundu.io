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
    /** Birth size (world px). */
    size: NumberRange;
    /**
     * Optional mid-life peak size. When set, size grows start→peak then
     * shrinks peak→endSize (see `peakAt` / `sizeEndAt`).
     */
    peakSize?: NumberRange;
    /** Lifetime progress [0,1] when `peakSize` is reached. Default 0.35. */
    peakAt?: number;
    endSize?: number;
    /** Lifetime progress [0,1] when size reaches `endSize`. Default 1. */
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
    /** Start alpha (peak after fade-in). Defaults to 1. */
    alpha?: number;
    /**
     * Lifetime progress [0,1] when fade-in completes.
     * `0` / omit = start at full alpha; `0.2` = ease 0→alpha over the first 20%.
     */
    alphaFadeIn?: number;
    /**
     * Lifetime progress [0,1] before alpha begins fading to 0.
     * `0` = fade from spawn (default); `0.5` = hold then fade in the second half.
     * Clamped to be >= `alphaFadeIn`.
     */
    alphaHold?: number;
    blendMode?: "normal" | "add" | "screen";
    zIndex?: number;
};
