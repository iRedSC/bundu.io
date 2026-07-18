import { Animation } from "../../animation/runtime";
import type { PartNode, BobData } from "../types";

const AMPLITUDE = 0.015;

/** Idle bob: sine on Y with a slight squash on the first part. */
export function bob(nodes: PartNode[], data: BobData = {}) {
    const amplitude = data.amplitude ?? AMPLITUDE;
    const target = nodes[0]?.animation;
    if (!target) throw new Error("bob preset needs one part");
    const animation = new Animation();

    animation.keyframes[0] = (active) => {
        if (active.isFirstKeyframe) active.goto(0, 1_200);
        const wave = Math.sin(active.t * Math.PI * 2);
        target.y = wave * amplitude * 0.35;
        target.scale.set(1 + wave * 0.025, 1 - wave * 0.025);
        if (active.keyframeEnded) active.goto(0, 1_200);
    };
    animation.cleanup = () => {
        target.y = 0;
        target.scale.set(1);
    };
    return animation;
}
