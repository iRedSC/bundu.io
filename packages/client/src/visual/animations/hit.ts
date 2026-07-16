import { random } from "@bundu/shared";
import { lerp, radians } from "@bundu/shared/transforms";
import { easeOut } from "../../animation/animations";
import { Animation } from "../../animation/runtime";
import type { HitData, PartNode, Rotatable } from "../types";

const DEFAULT_KICK_DEGREES = 14;
const DEFAULT_DURATION_MS = 450;
const WEAK_KICK_DEGREES = 5;
const WEAK_DURATION_MS = 280;

/** Dampened rotational wiggle on hit (structures). */
export function hitRotation(target: Rotatable, data?: HitData) {
    const kick = radians(data?.kick ?? DEFAULT_KICK_DEGREES);
    const duration = data?.duration ?? DEFAULT_DURATION_MS;
    const animation = new Animation();
    let base = 0;
    let dir = 1;

    const apply = (rotation: number) => {
        target.rotationStates.snap(rotation);
        target.rotation = rotation;
    };

    animation.keyframes[0] = (a) => {
        if (a.isFirstKeyframe) {
            base = target.rotation;
            dir = random.integer(0, 1) ? 1 : -1;
            a.goto(0, duration);
        }
        const damp = Math.exp(-5 * a.t);
        const wiggle = Math.sin(a.t * Math.PI * 5) * kick * damp * dir;
        apply(base + wiggle);
        if (a.keyframeEnded) a.expired = true;
    };

    animation.cleanup = () => apply(base);
    return animation;
}

/** Weaker wiggle for unsuccessful structure / resource hits. */
export function weakHitRotation(target: Rotatable) {
    return hitRotation(target, {
        kick: WEAK_KICK_DEGREES,
        duration: WEAK_DURATION_MS,
    });
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
