import { clamp, colorLerp, lerp } from "../../lib/transforms";
import { Animation, AnimationManager } from "../../lib/animations";
import { SpriteFactory } from "../assets/sprite_factory";
import { ColorSource, Container, Graphics, Sprite } from "pixi.js";

export type StatBarOptions = {
    min: number;
    max: number;
    median: number;
    decor: string;
    baseColor: ColorSource;
    overlayColor: ColorSource;
    diffColor: ColorSource;
    warningColor: ColorSource;

    warnOnLow?: boolean;
    warnOnHigh?: boolean;
};

export class StatBar {
    max: number;
    amount: number;
    min: number;
    median: number;
    lastAmount: number;

    container: Container;
    decor: Sprite;

    base: Graphics;
    baseDiff: Graphics;
    overlay: Graphics;
    overlayDiff: Graphics;

    baseColor: ColorSource;
    overlayColor: ColorSource;
    diffColor: ColorSource;
    warningColor: ColorSource;

    warnOnLow: boolean;
    warnOnHigh: boolean;

    constructor({
        min,
        max,
        median,
        decor,
        baseColor,
        overlayColor,
        diffColor,
        warningColor,
        warnOnLow = true,
        warnOnHigh = true,
    }: StatBarOptions) {
        this.min = min;
        this.max = max;
        this.median = median;

        this.warnOnHigh = warnOnHigh;
        this.warnOnLow = warnOnLow;

        this.baseColor = baseColor;
        this.overlayColor = overlayColor;
        this.diffColor = diffColor;
        this.warningColor = warningColor;

        this.lastAmount = 0;
        this.amount = 0;

        this.decor = SpriteFactory.build(decor, { x: 120, y: 25 });
        this.decor.anchor.set(0.5);

        this.container = new Container();
        this.container.scale.set(0.6);
        this.container.pivot.set(
            this.container.width / 2,
            this.container.height / 2
        );

        this.base = new Graphics();
        this.baseDiff = new Graphics();

        this.overlay = new Graphics();
        this.overlayDiff = new Graphics();

        this.container.addChild(this.baseDiff);
        this.container.addChild(this.base);
        this.container.addChild(this.overlayDiff);
        this.container.addChild(this.overlay);
        this.container.addChild(this.decor);
    }

    update(amount: number, manager: AnimationManager) {
        const animation = statsTransition(this);
        this.lastAmount = this.amount;
        this.amount = clamp(amount, this.min, this.max);
        manager.add(this, animation.run(true));
    }

    start(manager: AnimationManager) {
        const animation = statsWarning(this);
        manager.add(this, animation.run(true));
    }
}

function statsTransition(target: StatBar) {
    const animation = new Animation(0);
    let width = 300;
    let baseBefore = 0;
    let baseNow = 0;
    let overlayBefore = 0;
    let overlayNow = 0;

    animation.keyframes[0] = (animation) => {
        baseBefore =
            clamp(
                (target.lastAmount - target.min) / (target.median - target.min),
                0,
                1
            ) * width;
        baseNow =
            clamp(
                (target.amount - target.min) / (target.median - target.min),
                0,
                1
            ) * width;

        overlayBefore =
            clamp(
                (target.lastAmount - target.median) /
                    (target.max - target.median),
                0,
                1
            ) * width;
        overlayNow =
            clamp(
                (target.amount - target.median) / (target.max - target.median),
                0,
                1
            ) * width;

        animation.next(50);
    };

    animation.keyframes[1] = (animation) => {
        target.base.clear();
        target.base.beginFill(target.baseColor);
        target.base.drawRoundedRect(
            0,
            0,
            lerp(baseBefore, baseNow, animation.t),
            50,
            5
        );
        target.overlay.clear();
        target.overlay.beginFill(target.overlayColor);
        target.overlay.drawRoundedRect(
            0,
            0,
            lerp(overlayBefore, overlayNow, animation.t),
            50,
            5
        );
        if (animation.keyframeEnded) {
            animation.next(400);
        }
    };

    animation.keyframes[2] = (animation) => {
        target.baseDiff.clear();
        target.baseDiff.beginFill(target.diffColor);
        target.baseDiff.drawRoundedRect(
            0,
            0,
            lerp(baseBefore, baseNow, animation.t),
            50,
            5
        );

        target.overlayDiff.clear();
        target.overlayDiff.beginFill(target.diffColor);
        target.overlayDiff.drawRoundedRect(
            0,
            0,
            lerp(overlayBefore, overlayNow, animation.t),
            50,
            5
        );

        if (animation.keyframeEnded) {
            animation.expired = true;
        }
    };

    return animation;
}

function statsWarning(target: StatBar) {
    const animation = new Animation(1);

    animation.keyframes[0] = (animation) => {
        animation.next(250);
    };

    animation.keyframes[1] = (animation) => {
        const percent =
            (target.amount - target.min) / (target.max - target.min);
        if (target.warnOnHigh && percent > 0.8) {
            target.overlay.tint = colorLerp(
                0xffffff,
                target.warningColor as number,
                animation.t
            );
        } else if (target.warnOnLow && percent < 0.2) {
            target.base.tint = colorLerp(
                0xffffff,
                target.warningColor as number,
                animation.t
            );
        } else {
            target.base.tint = 0xffffff;
            target.overlay.tint = 0xffffff;
        }

        if (animation.keyframeEnded) {
            animation.next(250);
        }
    };

    animation.keyframes[2] = (animation) => {
        const percent =
            (target.amount - target.min) / (target.max - target.min);
        if (target.warnOnHigh && percent > 0.8) {
            target.overlay.tint = colorLerp(
                target.warningColor as number,
                0xffffff,
                animation.t
            );
        } else if (target.warnOnLow && percent < 0.2) {
            target.base.tint = colorLerp(
                target.warningColor as number,
                0xffffff,
                animation.t
            );
        } else {
            target.base.tint = 0xffffff;
            target.overlay.tint = 0xffffff;
        }

        if (animation.keyframeEnded) {
            animation.previous(250);
        }
    };
    return animation;
}
