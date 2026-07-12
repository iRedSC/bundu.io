import { colorLerp } from "@bundu/shared/transforms";
import type { ColorSource } from "pixi.js";
import { Animation } from "../../animation/runtime";
import type { PartNode } from "../types";

type Tintable = { tint: ColorSource };

/** Tint flash on part visuals. */
export function hurt(nodes: PartNode[]) {
    const targets: Tintable[] = nodes.map((node) => node.visual);
    const animation = new Animation();
    let tints: ColorSource[] = [];

    animation.keyframes[0] = (a) => {
        if (a.isFirstKeyframe) {
            tints = targets.map((target) => target.tint);
            a.goto(0, 100);
        }
        for (const [i, target] of targets.entries()) {
            target.tint = colorLerp(Number(tints[i]), 0xff0000, a.t);
        }
        if (a.keyframeEnded) a.next(400);
    };

    animation.keyframes[1] = (a) => {
        for (const target of targets) {
            target.tint = colorLerp(0xff0000, 0xffffff, a.t);
        }
        if (a.keyframeEnded) a.expired = true;
    };

    return animation;
}
