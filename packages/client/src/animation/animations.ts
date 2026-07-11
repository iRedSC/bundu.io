import { AnimationManager } from "./runtime";

export class AnimationManagers {
    static UI: AnimationManager = new AnimationManager();
    static World: AnimationManager = new AnimationManager();
}

export enum ANIMATION {
    HURT = 100,

    IDLE_HANDS = 200,

    ATTACK = 300,
    BLOCK = 301,
}

/** Ease-out cubic — fast start, soft landing. */
export const easeOut = (t: number): number => 1 - (1 - t) ** 3;

/** Ease-in cubic — soft start, fast finish. */
export const easeIn = (t: number): number => t ** 3;
