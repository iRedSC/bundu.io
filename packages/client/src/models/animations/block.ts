import { lerp, radians } from "@bundu/shared/transforms";
import { Animation } from "../../animation/runtime";
import type { AnimContext, PartNode } from "../types";
import { limbRoots } from "./limb_roots";

/** Player block pose. Expects parts [leftHand, rightHand, body]. */
export function block(nodes: PartNode[], ctx: AnimContext) {
    const { left, right, body } = limbRoots(nodes);
    let bodyRot = 0;
    let leftRot = 0;
    let rightRot = 0;
    const animation = new Animation();

    animation.keyframes[0] = (a) => {
        bodyRot = body.rotation;
        leftRot = left.rotation;
        rightRot = right.rotation;
        a.next(75);
    };

    animation.keyframes[1] = (a) => {
        left.rotation = lerp(leftRot, radians(-90), a.t);
        right.rotation = lerp(rightRot, radians(45), a.t);
        body.rotation = lerp(bodyRot, radians(15), a.t);
        if (!ctx.blocking) a.next(60);
    };

    animation.keyframes[2] = (a) => {
        left.rotation = lerp(radians(-90), radians(0), a.t);
        right.rotation = lerp(radians(45), radians(0), a.t);
        body.rotation = lerp(radians(15), radians(0), a.t);
        if (a.keyframeEnded) a.expired = true;
    };

    animation.cleanup = () => {
        left.rotation = leftRot;
        right.rotation = rightRot;
        body.rotation = bodyRot;
    };

    return animation;
}
