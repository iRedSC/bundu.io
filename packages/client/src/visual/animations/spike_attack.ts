import { lerp } from "@bundu/shared/transforms";
import { easeOut } from "../../animation/animations";
import { Animation } from "../../animation/runtime";
import type { PartNode } from "../types";

/** Rapid scale-up punch when a spike attacks, then settle. */
export function spikeAttack(node: PartNode) {
    const target = node.animation;
    const base = target.scale.x;
    const peak = base * 1.18;
    const animation = new Animation();

    animation.keyframes[0] = (a) => {
        if (a.isFirstKeyframe) a.goto(0, 80);
        target.scale.set(lerp(base, peak, easeOut(a.t)));
        if (a.keyframeEnded) a.next(160);
    };

    animation.keyframes[1] = (a) => {
        target.scale.set(lerp(peak, base, easeOut(a.t)));
        if (a.keyframeEnded) a.expired = true;
    };

    animation.cleanup = () => target.scale.set(base);
    return animation;
}
