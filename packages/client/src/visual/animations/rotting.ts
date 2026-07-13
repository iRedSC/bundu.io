import { Animation } from "../../animation/runtime";
import type { PartNode } from "../types";

const DURATION = 2_500;
const PULSE = 0.015;

/** Subtle continuous pulse while an entity's rotting state is active. */
export function rotting(nodes: PartNode[]) {
    const animation = new Animation();

    animation.keyframes[0] = (active) => {
        if (active.isFirstKeyframe) active.goto(0, DURATION);
        const scale = 1 + Math.sin(active.t * Math.PI * 2) * PULSE;
        for (const node of nodes) node.animation.scale.set(scale);
        if (active.keyframeEnded) active.goto(0, DURATION);
    };

    animation.cleanup = () => {
        for (const node of nodes) node.animation.scale.set(1);
    };

    return animation;
}
