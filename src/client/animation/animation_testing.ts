export const cubicBezier = (
    x1: number,
    y1: number,
    x2: number,
    y2: number
): ((t: number) => number) => {
    const cx = 3.0 * x1;
    const bx = 3.0 * (x2 - x1) - cx;
    const ax = 1.0 - cx - bx;

    const cy = 3.0 * y1;
    const by = 3.0 * (y2 - y1) - cy;
    const ay = 1.0 - cy - by;

    const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
    const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
    const sampleDerivX = (t: number) => (3.0 * ax * t + 2.0 * bx) * t + cx;

    function calculateTime(t: number) {
        let t0;
        let t1;
        let t2;
        let x2;
        let d2;
        let i;

        // First try a few iterations of Newton's method -- normally very fast.
        for (t2 = t, i = 0; i < 8; i++) {
            x2 = sampleX(t2) - t;
            if (Math.abs(x2) < Number.EPSILON) return t2;
            d2 = sampleDerivX(t2);
            if (Math.abs(d2) < Number.EPSILON) break;
            t2 = t2 - x2 / d2;
        }

        // No solution found - use bi-section
        t0 = 0.0;
        t1 = 1.0;
        t2 = t;

        if (t2 < t0) return t0;
        if (t2 > t1) return t1;

        for (i = 0; i < 1000 && t0 < t1; i++) {
            x2 = sampleX(t2);
            if (Math.abs(x2 - t) < Number.EPSILON) return t2;
            if (t > x2) t0 = t2;
            else t1 = t2;

            t2 = (t1 - t0) * 0.5 + t0;
        }

        // Give up
        return sampleY(t2);
    }
    return calculateTime;
};

import { ColorSource } from "pixi.js";
import { Animation } from "../../lib/animations.js";
import { colorLerp, lerp } from "../../lib/transforms";
import { ANIMATION } from "./animations";

type Tintable = { tint: ColorSource };
export function hurt(targets: Tintable[]) {
    const animation = new Animation(ANIMATION.HURT);

    animation.keyframes[0] = (animation) => {
        if (animation.isFirstKeyframe) {
            animation.goto(0, 100);
        }
        const color = colorLerp(0xffffff, 0xff0000, animation.t);
        for (const target of targets) {
            target.tint = color;
        }
        if (animation.keyframeEnded) {
            animation.next(400);
        }
    };

    animation.keyframes[1] = (animation) => {
        const color = colorLerp(0xff0000, 0xffffff, animation.t);
        for (const target of targets) {
            target.tint = color;
        }
        if (animation.keyframeEnded) {
            animation.expired = true;
        }
    };

    return animation;
}

type ObjectWithSize = { size: number };
export function hit(target: ObjectWithSize) {
    const timingFunction = cubicBezier(0.5, 0, 0.09, 1.51);
    const scale = target.size;
    const animation = new Animation(ANIMATION.HURT);
    animation.keyframes[0] = (animation) => {
        if (animation.isFirstKeyframe) {
            animation.goto(0, 100);
        }
        const t = timingFunction(animation.t);
        target.size = lerp(scale, scale / 1.1, t);
        if (animation.keyframeEnded) {
            animation.next(400);
        }
    };
    animation.keyframes[1] = (animation) => {
        const t = timingFunction(animation.t);
        target.size = lerp(scale / 1.1, scale, t);
        if (animation.keyframeEnded) {
            animation.expired = true;
        }
    };
    animation.keyframes[-1] = () => {
        target.size = scale;
    };
    return animation;
}
