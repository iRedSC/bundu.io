import { random } from "@bundu/shared";
import { lerp, radians } from "@bundu/shared/transforms";
import { easeIn, easeOut } from "../../animation/animations";
import { Animation } from "../../animation/runtime";
import type { AnimContext, PartNode } from "../types";
import { limbRoots } from "./limb_roots";

/** Player attack swing. Expects parts [leftHand, rightHand, body]. */
export function attack(nodes: PartNode[], ctx: AnimContext) {
    const { left, right, body } = limbRoots(nodes);
    let targetHand = 0;
    const animation = new Animation();

    animation.keyframes[0] = (a) => {
        if (ctx.blocking) return;
        targetHand = !(ctx.mainhand === "" && ctx.offhand === "")
            ? 1
            : random.integer(0, 1);
        if (left.rotation !== 0) {
            left.rotation = 0;
            right.rotation = 0;
        }
        a.next(125);
    };

    animation.keyframes[1] = (a) => {
        const t = easeOut(a.t);
        if (targetHand) {
            left.rotation = lerp(radians(0), radians(-100), t);
            right.rotation = lerp(radians(0), radians(-10), t);
            body.rotation = lerp(radians(0), radians(-25), t);
        } else {
            right.rotation = lerp(radians(0), radians(100), t);
            left.rotation = lerp(radians(0), radians(10), t);
            body.rotation = lerp(radians(0), radians(25), t);
        }
        if (a.keyframeEnded) a.next(275);
    };

    animation.keyframes[2] = (a) => {
        const t = easeIn(a.t);
        if (targetHand) {
            left.rotation = lerp(radians(-100), radians(0), t);
            right.rotation = lerp(radians(-10), radians(0), t);
            body.rotation = lerp(radians(-25), radians(0), t);
        } else {
            right.rotation = lerp(radians(100), radians(0), t);
            left.rotation = lerp(radians(10), radians(0), t);
            body.rotation = lerp(radians(25), radians(0), t);
        }
        if (a.keyframeEnded) a.expired = true;
    };

    animation.cleanup = () => {
        left.rotation = 0;
        right.rotation = 0;
        body.rotation = 0;
    };

    return animation;
}
