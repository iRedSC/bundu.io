import { lerp, radians } from "@bundu/shared/transforms";
import { Animation } from "../../animation/runtime";
import type { AnimContext, PartNode } from "../types";
import { limbRoots } from "./limb_roots";
import { foodCrumbs } from "../particles/food_crumbs";

/** Raises the offhand food to the player's mouth for the server-provided duration. */
export function eat(nodes: PartNode[], ctx: AnimContext) {
    const { right, body } = limbRoots(nodes);
    let rightRot = 0;
    let bodyRot = 0;
    let rightY = 0;
    let nextCrumbAt = 0;
    const animation = new Animation();

    animation.keyframes[0] = (a) => {
        rightRot = right.rotation;
        bodyRot = body.rotation;
        rightY = right.y;
        a.next(150);
    };
    animation.keyframes[1] = (a) => {
        right.rotation = lerp(rightRot, radians(110), a.t);
        body.rotation = lerp(bodyRot, radians(-12), a.t);
        right.y = lerp(rightY, rightY - 0.08, a.t);
        if (a.keyframeEnded) a.next(320);
    };
    animation.keyframes[2] = (a) => {
        right.y = rightY - 0.08 + Math.sin(a.t * Math.PI * 2) * 0.025;
        if (
            a.now >= nextCrumbAt &&
            ctx.emitParticles &&
            ctx.particleAnchor
        ) {
            nextCrumbAt = a.now + 220;
            const anchor = ctx.particleAnchor();
            ctx.emitParticles(foodCrumbs(anchor.texture, anchor.x, anchor.y));
        }
        if (!ctx.eating) a.next(150);
        else if (a.keyframeEnded) a.goto(2, 320);
    };
    animation.keyframes[3] = (a) => {
        right.rotation = lerp(radians(110), rightRot, a.t);
        body.rotation = lerp(radians(-12), bodyRot, a.t);
        right.y = lerp(rightY - 0.08, rightY, a.t);
        if (a.keyframeEnded) a.expired = true;
    };
    animation.cleanup = () => {
        right.rotation = rightRot;
        body.rotation = bodyRot;
        right.y = rightY;
    };
    return animation;
}
