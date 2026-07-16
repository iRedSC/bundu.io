import { lerp, radians } from "@bundu/shared/transforms";
import { easeOut } from "../../animation/animations";
import { Animation } from "../../animation/runtime";
import type { HitData, HitTarget, PartNode } from "../types";

const DEFAULT_KICK_DEGREES = 14;
const DEFAULT_DURATION_MS = 450;
/** Peak positional push along the attack direction on successful hits. */
const KNOCKBACK_DISTANCE = 22;

export type HitRotationOptions = {
    /** Radians: direction from hit origin into the target (attack direction). */
    angle: number;
    /** Successful hits also push the target along `angle`. */
    knockback: boolean;
    data?: HitData;
    /** Keep promoted world layers in sync when mutating the object transform. */
    onApply?: () => void;
};

/** Dampened rotational wiggle on hit (structures); optional knockback on success. */
export function hitRotation(target: HitTarget, options: HitRotationOptions) {
    const kick = radians(options.data?.kick ?? DEFAULT_KICK_DEGREES);
    const duration = options.data?.duration ?? DEFAULT_DURATION_MS;
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
            a.goto(0, duration);
        }
        const damp = Math.exp(-5 * a.t);
        const wiggle = Math.sin(a.t * Math.PI * 5) * kick * damp * dir;
        applyRotation(baseRot + wiggle);
        if (knockback) {
            const offset = Math.sin(a.t * Math.PI) * KNOCKBACK_DISTANCE;
            applyPosition(
                baseX + Math.cos(angle) * offset,
                baseY + Math.sin(angle) * offset
            );
        }
        if (a.keyframeEnded) a.expired = true;
    };

    animation.cleanup = () => {
        applyRotation(baseRot);
        if (knockback) applyPosition(baseX, baseY);
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
