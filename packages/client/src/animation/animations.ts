import type { ColorSource } from "pixi.js";
import { Animation, AnimationManager } from "./runtime";
import { colorLerp, lerp } from "@bundu/shared/transforms";

export class AnimationManagers {
    static UI: AnimationManager = new AnimationManager();
    static World: AnimationManager = new AnimationManager();
}

export enum ANIMATION {
    HURT = 100,
    ENTITY_IDLE = 101,

    IDLE_HANDS = 200,

    ATTACK = 300,
    BLOCK = 301,
}

/** Ease-out cubic — fast start, soft landing. */
export const easeOut = (t: number): number => 1 - (1 - t) ** 3;

/** Ease-in cubic — soft start, fast finish. */
export const easeIn = (t: number): number => t ** 3;

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
    // same the current target's size for use in the animation
    const scale = target.size;

    const animation = new Animation();

    animation.keyframes[0] = (animation) => {
        // if this is the first keyframe the animation has played, restart it with
        // a duration of 100ms (when the animation is first called it does not have a duration)
        if (animation.isFirstKeyframe) {
            animation.goto(0, 100);
        }

        const t = easeOut(animation.t);

        // lerp the target's size based on the previously saved scale value
        target.size = lerp(scale, scale / 1.1, t);

        //if this keyframe ended, goto the next one with a duration of 400ms
        if (animation.keyframeEnded) {
            animation.next(400);
        }
    };

    animation.keyframes[1] = (animation) => {
        // we just do the reverse of the first one here

        const t = easeOut(animation.t);

        target.size = lerp(scale / 1.1, scale, t);

        // once this keyframe ends, set the animation to expired
        if (animation.keyframeEnded) {
            animation.expired = true;
        }
    };

    // in case the animation is cut short in some way, reset the targets siz
    animation.cleanup = () => {
        target.size = scale;
    };

    // return the animation, storing the curried values from the function
    return animation;
}
