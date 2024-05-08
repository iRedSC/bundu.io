import { ColorSource } from "pixi.js";
import { Animation } from "../../lib/animations.js";
import { colorLerp, lerp } from "../../lib/transforms";

export enum ANIMATION {
    HURT = 100,
    ENTITY_IDLE = 101,

    IDLE_HANDS = 200,

    ATTACK = 300,
    BLOCK = 301,
}

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

type Tintable = { tint: ColorSource };
export function hurt(targets: Tintable[]) {
    const animation = new Animation();
    let tints: ColorSource[] = [];

    animation.keyframes[0] = (animation) => {
        if (animation.isFirstKeyframe) {
            tints = targets.map((target) => target.tint);
            animation.goto(0, 100);
        }
        for (const [i, target] of targets.entries()) {
            target.tint = colorLerp(Number(tints[i]), 0xff0000, animation.t);
        }
        if (animation.keyframeEnded) {
            animation.next(400);
        }
    };

    animation.keyframes[1] = (animation) => {
        for (const target of targets) {
            target.tint = colorLerp(0xff0000, 0xffffff, animation.t);
        }
        if (animation.keyframeEnded) {
            animation.expired = true;
        }
    };

    return animation;
}

type ObjectWithSize = { size: number };

export function hit(target: ObjectWithSize) {
    // set up a timing function that transforms the t value
    const timingFunction = cubicBezier(0.5, 0, 0.09, 1.51);

    // same the current target's size for use in the animation
    const scale = target.size;

    const animation = new Animation();

    animation.keyframes[0] = (animation) => {
        // if this is the first keyframe the animation has played, restart it with
        // a duration of 100ms (when the animation is first called it does not have a duration)
        if (animation.isFirstKeyframe) {
            animation.goto(0, 100);
        }

        // call the timing function and get transformed t value
        const t = timingFunction(animation.t);

        // lerp the target's size based on the previously saved scale value
        target.size = lerp(scale, scale / 1.1, t);

        //if this keyframe ended, goto the next one with a duration of 400ms
        if (animation.keyframeEnded) {
            animation.next(400);
        }
    };

    animation.keyframes[1] = (animation) => {
        // we just do the reverse of the first one here

        const t = timingFunction(animation.t);

        target.size = lerp(scale / 1.1, scale, t);

        // once this keyframe ends, set the animation to expired
        if (animation.keyframeEnded) {
            animation.expired = true;
        }
    };

    // in case the animation is cut short in some way, reset the targets siz
    animation.keyframes[-1] = () => {
        target.size = scale;
    };

    // return the animation, storing the curried values from the function
    return animation;
}
