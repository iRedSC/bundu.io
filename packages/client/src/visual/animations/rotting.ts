import { Animation } from "../../animation/runtime";
import { radians } from "@bundu/shared";
import type { PartNode } from "../types";

const DURATION = 2_500;
const SHAKE = radians(1.2);

/** Soft continuous shake while an entity's rotting state is active. */
export function rotting(nodes: PartNode[]) {
    const animation = new Animation();

    animation.keyframes[0] = (active) => {
        if (active.isFirstKeyframe) active.goto(0, DURATION);
        const rotation = Math.sin(active.t * Math.PI * 6) * SHAKE;
        for (const node of nodes) node.animation.rotation = rotation;
        if (active.keyframeEnded) active.goto(0, DURATION);
    };

    animation.cleanup = () => {
        for (const node of nodes) node.animation.rotation = 0;
    };

    return animation;
}
