import { random } from "@bundu/shared";
import { lerp, radians } from "@bundu/shared/transforms";
import { easeOut } from "../../animation/animations";
import { Animation } from "../../animation/runtime";
import type { PartNode, Rotatable } from "../types";

/** Dampened rotational wiggle on hit (structures). */
export function hitRotation(target: Rotatable) {
    const kick = radians(14);
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
            a.goto(0, 450);
        }
        const damp = Math.exp(-5 * a.t);
        const wiggle = Math.sin(a.t * Math.PI * 5) * kick * damp * dir;
        apply(base + wiggle);
        if (a.keyframeEnded) a.expired = true;
    };

    animation.cleanup = () => apply(base);
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
