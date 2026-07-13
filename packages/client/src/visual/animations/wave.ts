import { random } from "@bundu/shared";
import { Animation } from "../../animation/runtime";
import type { PartNode } from "../types";

const WAVE = 0.01;

/** Idle sway: parts[0]/parts[1] opposite X, parts[2+] Y. */
export function wave(nodes: PartNode[]) {
    const bases = nodes.map((node) => ({
        x: node.animation.x,
        y: node.animation.y,
    }));
    const animation = new Animation();

    animation.keyframes[0] = (a) => {
        if (a.isFirstKeyframe) a.goto(0, 2000);
        const c = Math.cos(a.t * Math.PI * 2) * WAVE;
        const s = Math.sin(a.t * Math.PI * 2) * WAVE;

        const left = nodes[0];
        const right = nodes[1];
        const leftBase = bases[0];
        const rightBase = bases[1];
        if (left && leftBase) left.animation.x = leftBase.x + c;
        if (right && rightBase) right.animation.x = rightBase.x - c;
        for (let i = 2; i < nodes.length; i++) {
            const node = nodes[i];
            const base = bases[i];
            if (node && base) node.animation.y = base.y + s;
        }

        if (a.keyframeEnded) a.goto(0, random.integer(1500, 2500));
    };

    return animation;
}
