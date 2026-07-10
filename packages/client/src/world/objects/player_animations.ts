import { radians, lerp } from "@bundu/shared/transforms";
import { random } from "@bundu/shared";
import { easeIn, easeOut } from "../../animation/animations";
import { Animation } from "../../animation/runtime";
import { Container } from "pixi.js";

/** Minimal player surface needed by attack/block/idle keyframe DSL. */
export type PlayerAnimationTarget = {
    blocking: boolean;
    mainhand?: string;
    offhand?: string;
    sprite: {
        body: { container: Container };
        leftHand: { container: Container };
        rightHand: { container: Container };
    };
};

const IDLE_WAVE_DISTANCE = 0.01;

export function idleHands(
    left: Container,
    right: Container,
    body: Container
) {
    const leftX = left.x;
    const rightX = right.x;
    const bodyY = body.y;

    const animation = new Animation();
    animation.keyframes[0] = (animation) => {
        if (animation.isFirstKeyframe) {
            animation.goto(0, 2000);
        }

        left.x =
            leftX + Math.cos(animation.t * Math.PI * 2) * IDLE_WAVE_DISTANCE;
        right.x =
            rightX - Math.cos(animation.t * Math.PI * 2) * IDLE_WAVE_DISTANCE;
        body.y =
            bodyY + Math.sin(animation.t * Math.PI * 2) * IDLE_WAVE_DISTANCE;
        if (animation.keyframeEnded) {
            animation.goto(0, random.integer(1500, 2500));
        }
    };
    return animation;
}

export function attack(target: PlayerAnimationTarget) {
    let targetHand: number;
    const body = target.sprite.body.container;
    const leftHand = target.sprite.leftHand.container;
    const rightHand = target.sprite.rightHand.container;

    const animation = new Animation();
    animation.keyframes[0] = (animation) => {
        if (target.blocking) {
            return;
        }
        targetHand = !(target.mainhand === "" && target.offhand === "")
            ? 1
            : random.integer(0, 1);
        if (leftHand.rotation !== 0) {
            leftHand.rotation = 0;
            rightHand.rotation = 0;
        }
        animation.next(125);
    };
    animation.keyframes[1] = (animation) => {
        const t = easeOut(animation.t);
        if (targetHand) {
            leftHand.rotation = lerp(radians(0), radians(-100), t);
            rightHand.rotation = lerp(radians(0), radians(-10), t);
            body.rotation = lerp(radians(0), radians(-25), t);
        } else {
            rightHand.rotation = lerp(radians(0), radians(100), t);
            leftHand.rotation = lerp(radians(0), radians(10), t);
            body.rotation = lerp(radians(0), radians(25), t);
        }
        if (animation.keyframeEnded) {
            animation.next(275);
        }
    };
    animation.keyframes[2] = (animation) => {
        const t = easeIn(animation.t);
        if (targetHand) {
            leftHand.rotation = lerp(radians(-100), radians(0), t);
            rightHand.rotation = lerp(radians(-10), radians(0), t);
            body.rotation = lerp(radians(-25), radians(0), t);
        } else {
            rightHand.rotation = lerp(radians(100), radians(0), t);
            leftHand.rotation = lerp(radians(10), radians(0), t);
            body.rotation = lerp(radians(25), radians(0), t);
        }
        if (animation.keyframeEnded) {
            animation.expired = true;
        }
    };
    animation.cleanup = () => {
        leftHand.rotation = 0;
        rightHand.rotation = 0;
        body.rotation = 0;
    };
    return animation;
}

export function block(target: PlayerAnimationTarget) {
    const body = target.sprite.body.container;
    const leftHand = target.sprite.leftHand.container;
    const rightHand = target.sprite.rightHand.container;
    let bodyRot = 0;
    let leftHandRot = 0;
    let rightHandRot = 0;

    const animation = new Animation();
    animation.keyframes[0] = (animation) => {
        bodyRot = target.sprite.body.container.rotation;
        leftHandRot = target.sprite.leftHand.container.rotation;
        rightHandRot = target.sprite.rightHand.container.rotation;
        animation.next(75);
    };
    animation.keyframes[1] = (animation) => {
        leftHand.rotation = lerp(
            radians(leftHandRot),
            radians(-90),
            animation.t
        );
        rightHand.rotation = lerp(
            radians(rightHandRot),
            radians(45),
            animation.t
        );

        body.rotation = lerp(radians(bodyRot), radians(15), animation.t);
        if (!target.blocking) {
            animation.next(60);
        }
    };
    animation.keyframes[2] = (animation) => {
        leftHand.rotation = lerp(radians(-90), radians(0), animation.t);
        rightHand.rotation = lerp(radians(45), radians(0), animation.t);
        body.rotation = lerp(radians(15), radians(0), animation.t);
        if (animation.keyframeEnded) {
            animation.expired = true;
        }
    };
    animation.cleanup = () => {
        leftHand.rotation = leftHandRot;
        rightHand.rotation = rightHandRot;
        body.rotation = bodyRot;
    };
    return animation;
}

export const PlayerAnimations = {
    idleHands,
    attack,
    block,
};
