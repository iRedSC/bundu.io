import { lerp } from "@bundu/shared/transforms";
import { easeOut } from "../../animation/animations";
import { Animation } from "../../animation/runtime";
import type { PartNode } from "../types";

/** Elastic scale pop when a structure is placed. */
export function place(node: PartNode) {
    const target = node.animation;
    const base = target.scale.x;
    const animation = new Animation();

    animation.keyframes[0] = (a) => {
        if (a.isFirstKeyframe) {
            target.scale.set(base * 0.65);
            a.goto(0, 120);
        }
        target.scale.set(lerp(base * 0.65, base * 1.12, easeOut(a.t)));
        if (a.keyframeEnded) a.next(160);
    };

    animation.keyframes[1] = (a) => {
        target.scale.set(lerp(base * 1.12, base, easeOut(a.t)));
        if (a.keyframeEnded) a.expired = true;
    };

    animation.cleanup = () => target.scale.set(base);
    return animation;
}
