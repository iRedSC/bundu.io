import { clamp, lerp } from "../../lib/transforms";
import { Animation } from "../../lib/animations";
import { SpriteFactory } from "../assets/sprite_factory";
import { ColorSource, Container, Sprite } from "pixi.js";
import { UIAnimationManager } from "../animation/animations";

export type StatBarOptions = {
    max: number;
    split: boolean;

    icon: string;
    tint: ColorSource;

    overlayTint: ColorSource;
    diffTint: ColorSource;

    warnOnLow?: boolean;
    warnOnHigh?: boolean;
};

export class StatBar {
    max: number;
    split: boolean;
    amount: number;
    displayAmount: number;

    container: Container;
    circle: Sprite;
    outline: Sprite;
    icon: Sprite;

    base: Sprite;
    baseDiff: Sprite;
    overlay: Sprite;
    overlayDiff: Sprite;

    tint: ColorSource;

    warnOnLow: boolean;
    warnOnHigh: boolean;

    constructor({
        max,
        icon,
        tint,
        overlayTint,
        diffTint,

        split = false,
        warnOnLow = true,
        warnOnHigh = true,
    }: StatBarOptions) {
        this.max = max;
        this.split = split;

        this.warnOnHigh = warnOnHigh;
        this.warnOnLow = warnOnLow;

        this.tint = tint;

        this.displayAmount = 0;
        this.amount = 0;

        this.icon = SpriteFactory.build(icon);
        this.icon.anchor.set(0.5);
        this.icon.scale.set(0.25);

        this.outline = SpriteFactory.build("stat_bar_outline");
        this.outline.anchor.set(0, 0.5);
        this.outline.scale.set(1.2);
        this.outline.tint = tint;

        this.circle = SpriteFactory.build("stat_bar_circle");
        this.circle.anchor.set(0.5);
        this.circle.scale.set(0.25);
        this.circle.tint = tint;

        this.container = new Container();
        this.container.scale.set(0.15);
        this.container.pivot.set(
            this.container.width / 2,
            this.container.height / 2
        );

        this.base = SpriteFactory.build("stat_bar");
        // this.base.scale.set(0.1);
        this.base.anchor.set(0, 0.5);
        this.base.tint = tint;

        this.baseDiff = SpriteFactory.build("stat_bar");
        // this.baseDiff.scale.set(0.1);
        this.baseDiff.anchor.set(0, 0.5);
        this.baseDiff.tint = diffTint;

        this.overlay = SpriteFactory.build("stat_bar");
        // this.overlay.scale.set(0.1);
        this.overlay.anchor.set(0, 0.5);
        this.overlay.tint = overlayTint;

        this.overlayDiff = SpriteFactory.build("stat_bar");
        // this.overlayDiff.scale.set(0.1);
        this.overlayDiff.anchor.set(0, 0.5);
        this.overlayDiff.tint = diffTint;

        this.container.addChild(this.baseDiff);
        this.container.addChild(this.base);
        this.container.addChild(this.overlayDiff);
        this.container.addChild(this.overlay);
        this.container.addChild(this.outline);
        this.container.addChild(this.circle);
        this.container.addChild(this.icon);
        UIAnimationManager.set(this, 0, statAnimation(this).run(), true);
    }

    update(amount: number) {
        this.amount = clamp(amount, 0, this.max);
    }
}

function statAnimation(target: StatBar) {
    const animation = new Animation();
    const buffer = 0;
    let width = 1000 * 1.175 - buffer;

    animation.keyframes[0] = (animation) => {
        let base;
        let overlay;
        if (target.split) {
            base =
                clamp(target.amount / (target.max / 2), 0, 1) * width + buffer;
            overlay =
                clamp(
                    (target.amount - target.max / 2) / (target.max / 2),
                    0,
                    1
                ) *
                    width +
                buffer;
        } else {
            base = clamp(target.amount / target.max, 0, 1) * width + buffer;
            overlay = buffer;
        }

        target.base.width = lerp(target.base.width, base, 0.05);
        if (Math.abs(target.base.width - base) < 2) {
            target.baseDiff.width = lerp(target.baseDiff.width, base, 0.02);
        }
        target.overlay.width = lerp(target.overlay.width, overlay, 0.05);
        if (Math.abs(target.overlay.width - overlay) < 2) {
            target.overlayDiff.width = lerp(
                target.overlayDiff.width,
                overlay,
                0.02
            );
        }

        animation.next(120);
    };

    return animation;
}

// function statsWarning(target: StatBar) {
//     const animation = new Animation();

//     animation.keyframes[0] = (animation) => {
//         animation.next(250);
//     };

//     animation.keyframes[1] = (animation) => {
//         const percent =
//             (target.amount - target.min) / (target.max - target.min);
//         if (target.warnOnHigh && percent > 0.8) {
//             target.overlay.tint = colorLerp(
//                 0xffffff,
//                 target.warningColor as number,
//                 animation.t
//             );
//         } else if (target.warnOnLow && percent < 0.2) {
//             target.base.tint = colorLerp(
//                 0xffffff,
//                 target.warningColor as number,
//                 animation.t
//             );
//         } else {
//             target.base.tint = 0xffffff;
//             target.overlay.tint = 0xffffff;
//         }

//         if (animation.keyframeEnded) {
//             animation.next(250);
//         }
//     };

//     animation.keyframes[2] = (animation) => {
//         const percent =
//             (target.amount - target.min) / (target.max - target.min);
//         if (target.warnOnHigh && percent > 0.8) {
//             target.overlay.tint = colorLerp(
//                 target.warningColor as number,
//                 0xffffff,
//                 animation.t
//             );
//         } else if (target.warnOnLow && percent < 0.2) {
//             target.base.tint = colorLerp(
//                 target.warningColor as number,
//                 0xffffff,
//                 animation.t
//             );
//         } else {
//             target.base.tint = 0xffffff;
//             target.overlay.tint = 0xffffff;
//         }

//         if (animation.keyframeEnded) {
//             animation.previous(250);
//         }
//     };
//     return animation;
// }
