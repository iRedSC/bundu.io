import { lerp, radians } from "@bundu/shared/transforms";
import { easeOut } from "../../animation/animations";
import { Animation } from "../../animation/runtime";
import type { AnimContext, HitData, HitTarget, PartNode } from "../types";

const DEFAULT_KICK_DEGREES = 14;
const DEFAULT_DURATION_MS = 450;
/** Peak positional push away from the hit origin on successful hits. */
const KNOCKBACK_DISTANCE = 6;

/** Dampened rotational wiggle on hit (structures); optional knockback on success. */
export function hitRotation(
    target: HitTarget,
    ctx: AnimContext,
    data?: HitData
) {
    const kick = radians(data?.kick ?? DEFAULT_KICK_DEGREES);
    const duration = data?.duration ?? DEFAULT_DURATION_MS;
    const animation = new Animation();
    let baseRot = 0;
    let baseX = 0;
    let baseY = 0;
    let dir = 1;
    let away = 0;
    let knockback = false;

    const applyRotation = (rotation: number) => {
        target.rotationStates.snap(rotation);
        target.rotation = rotation;
    };

    const applyPosition = (x: number, y: number) => {
        target.positionStates.snap({ x, y });
        target.position.set(x, y);
    };

    animation.keyframes[0] = (a) => {
        if (a.isFirstKeyframe) {
            baseRot = target.rotation;
            baseX = target.position.x;
            baseY = target.position.y;
            const impact = ctx.hitImpactAngle ?? 0;
            // Lean based on which side the hit origin is on (not random / facing).
            dir = Math.sin(impact - baseRot) >= 0 ? 1 : -1;
            away = impact + Math.PI;
            knockback = ctx.hitKnockback === true;
            a.goto(0, duration);
        }
        const damp = Math.exp(-5 * a.t);
        const wiggle = Math.sin(a.t * Math.PI * 5) * kick * damp * dir;
        applyRotation(baseRot + wiggle);
        if (knockback) {
            const offset = Math.sin(a.t * Math.PI) * KNOCKBACK_DISTANCE;
            applyPosition(
                baseX + Math.cos(away) * offset,
                baseY + Math.sin(away) * offset
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
