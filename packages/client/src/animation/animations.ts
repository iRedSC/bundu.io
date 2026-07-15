import { AnimationManager } from "./runtime";

export const AnimationManagers = {
    UI: new AnimationManager(),
    World: new AnimationManager(),
};

export const ANIMATION = {
    HURT: "hurt",
    HIT: "hit",
    PLACE: "place",
    IDLE_HANDS: "idle_hands",
    ATTACK: "attack",
    BLOCK: "block",
    EAT: "eat",
} as const;

/** Ease-out cubic — fast start, soft landing. */
export const easeOut = (t: number): number => 1 - (1 - t) ** 3;

/** Ease-in cubic — soft start, fast finish. */
export const easeIn = (t: number): number => t ** 3;
