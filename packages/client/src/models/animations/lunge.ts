import { lerp } from "@bundu/shared/transforms";
import { Animation } from "../../animation/runtime";
import type { PartNode } from "../types";

/**
 * Short forward lunge on the first part (animals).
 * Uses `state.x` so motion stays along facing (+X in the object root),
 * independent of the body art's -90° pose and of idle bob on `animation`.
 */
export function lunge(nodes: PartNode[]) {
    const target = nodes[0]?.state;
    if (!target) throw new Error("lunge preset needs one part");
    const animation = new Animation();

    animation.keyframes[0] = (active) => {
        if (active.isFirstKeyframe) active.goto(0, 100);
        target.x = lerp(0, 0.09, active.t);
        if (active.keyframeEnded) active.next(150);
    };
    animation.keyframes[1] = (active) => {
        target.x = lerp(0.09, 0, active.t);
        if (active.keyframeEnded) active.expired = true;
    };
    animation.cleanup = () => {
        target.x = 0;
    };
    return animation;
}
