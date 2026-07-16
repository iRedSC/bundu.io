import { clamp, lerp, radians } from "@bundu/shared/transforms";
import { easeOut } from "../../animation/animations";
import { Animation } from "../../animation/runtime";
import type { HitTarget, PartNode } from "../types";

/** HitEvent strength is clamped to this range on the server. */
export const HIT_STRENGTH_MAX = 10;

const WIGGLE_DEG = { min: 5, max: 18 } as const;
const KNOCKBACK_PX = { min: 0, max: 28 } as const;
const PARTICLE_COUNT = { min: 0, max: 8 } as const;
const DEFAULT_DURATION_MS = 450;

/** Map strength 0–10 onto clamped FX magnitudes. */
export function hitFxFromStrength(strength: number) {
    const t = clamp(strength, 0, HIT_STRENGTH_MAX) / HIT_STRENGTH_MAX;
    return {
        kickDegrees: lerp(WIGGLE_DEG.min, WIGGLE_DEG.max, t),
        knockback: lerp(KNOCKBACK_PX.min, KNOCKBACK_PX.max, t),
        particles: Math.round(lerp(PARTICLE_COUNT.min, PARTICLE_COUNT.max, t)),
    };
}

export type HitRotationOptions = {
    /** Radians: direction from hit origin into the target (attack direction). */
    angle: number;
    /** Peak wiggle in degrees (already clamped via hitFxFromStrength). */
    kickDegrees: number;
    /** Peak knockback distance in world px (0 = rotation only). */
    knockback: number;
    /** Keep promoted world layers in sync when mutating the object transform. */
    onApply?: () => void;
};

/** Dampened rotational wiggle on hit (structures); scaled knockback. */
export function hitRotation(target: HitTarget, options: HitRotationOptions) {
    const kick = radians(options.kickDegrees);
    const { angle, knockback, onApply } = options;
    const animation = new Animation();
    let baseRot = 0;
    let baseX = 0;
    let baseY = 0;
    let dir = 1;

    const applyRotation = (rotation: number) => {
        target.rotationStates.snap(rotation);
        target.rotation = rotation;
        onApply?.();
    };

    const applyPosition = (x: number, y: number) => {
        target.positionStates.snap({ x, y });
        target.position.set(x, y);
        onApply?.();
    };

    animation.keyframes[0] = (a) => {
        if (a.isFirstKeyframe) {
            baseRot = target.rotation;
            baseX = target.position.x;
            baseY = target.position.y;
            // Lean based on hit origin side relative to current facing.
            dir = Math.sin(angle + Math.PI - baseRot) >= 0 ? 1 : -1;
            a.goto(0, DEFAULT_DURATION_MS);
        }
        const damp = Math.exp(-5 * a.t);
        const wiggle = Math.sin(a.t * Math.PI * 5) * kick * damp * dir;
        applyRotation(baseRot + wiggle);
        if (knockback > 0) {
            // Same duration + damp as the wiggle so the push settles with it.
            const offset = Math.sin(a.t * Math.PI) * knockback * damp;
            applyPosition(
                baseX + Math.cos(angle) * offset,
                baseY + Math.sin(angle) * offset
            );
        }
        if (a.keyframeEnded) a.expired = true;
    };

    animation.cleanup = () => {
        applyRotation(baseRot);
        if (knockback > 0) applyPosition(baseX, baseY);
    };
    return animation;
}

/** Scale punch on the first part's root. */
export function hit(node: PartNode) {
    const target = node.animation;
    const base = target.scale.x;
    const animation = new Animation();

    animation.keyframes[0] = (a) => {
        if (a.isFirstKeyframe) a.goto(0, 100);
        target.scale.set(lerp(base, base / 1.1, easeOut(a.t)));
        if (a.keyframeEnded) a.next(400);
    };

    animation.keyframes[1] = (a) => {
        target.scale.set(lerp(base / 1.1, base, easeOut(a.t)));
        if (a.keyframeEnded) a.expired = true;
    };

    animation.cleanup = () => target.scale.set(base);
    return animation;
}
