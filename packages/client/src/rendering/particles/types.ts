import type { Texture } from "pixi.js";

export type NumberRange = number | readonly [min: number, max: number];

/** Outward unit normal from a blocking circle at the contact point. */
export type ParticleBlockHit = {
    nx: number;
    ny: number;
};

/**
 * Non-ballistic position controller. Default motion is velocity + gravity.
 * `surge` washes along `direction` then reverses — for shore wave bands.
 */
export type ParticleMotion = {
    kind: "surge";
    /** World px from spawn to apex along `direction`. */
    distance: NumberRange;
    /** Lifetime progress [0,1] at farthest point. Default 0.45. */
    apexAt?: number;
};

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
    /** Overrides ballistic integration when set. */
    motion?: ParticleMotion;
    /**
     * While a surge particle is washing inbound, return a circle-hit normal to
     * retreat seaward along that normal (wave hitting an outcropping).
     * `hitRadius` is the particle's world-space radius for circle tests.
     */
    blockedAt?: (
        x: number,
        y: number,
        hitRadius: number
    ) => ParticleBlockHit | undefined;
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
    /**
     * Bake particles in this burst into one coverage pass, then draw at this
     * alpha. Overlaps merge into a single silhouette instead of stacking.
     */
    mergeAlpha?: number;
};
