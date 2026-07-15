import { lerp, radians } from "@bundu/shared/transforms";
import { Animation } from "../../animation/runtime";
import type { AnimContext, PartNode } from "../types";
import { limbRoots } from "./limb_roots";

/** Raises the offhand food to the player's mouth for the server-provided duration. */
export function eat(nodes: PartNode[], ctx: AnimContext) {
    const { right, body } = limbRoots(nodes);
    const duration = Math.max(1, ctx.eatingDuration ?? 1000);
    let rightRot = 0;
    let bodyRot = 0;
    const animation = new Animation();

    animation.keyframes[0] = (a) => {
        rightRot = right.rotation;
        bodyRot = body.rotation;
        a.next(duration * 0.2);
    };
    animation.keyframes[1] = (a) => {
        right.rotation = lerp(rightRot, radians(110), a.t);
        body.rotation = lerp(bodyRot, radians(-12), a.t);
        if (a.keyframeEnded) a.next(duration * 0.6);
    };
    animation.keyframes[2] = (a) => {
        right.rotation = lerp(radians(110), rightRot, a.t);
        body.rotation = lerp(radians(-12), bodyRot, a.t);
        if (a.keyframeEnded) a.expired = true;
    };
    animation.cleanup = () => {
        right.rotation = rightRot;
        body.rotation = bodyRot;
    };
    return animation;
}
