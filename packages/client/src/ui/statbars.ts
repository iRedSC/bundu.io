import { clamp, lerp } from "@bundu/shared/transforms";
import { ContaineredSprite, SpriteFactory } from "../assets/sprite_factory";
import { type ColorSource, Container } from "pixi.js";

export type StatBarOptions = {
    max: number;
    split: boolean;

    icon: string;
    tint: ColorSource;

    overlayTint: ColorSource;
    diffTint: ColorSource;
};

export class StatBar {
    max: number;
    split: boolean;
    amount: number;
    displayAmount: number;

    container: Container;
    circle: ContaineredSprite;
    outline: ContaineredSprite;
    icon: ContaineredSprite;

    base: ContaineredSprite;
    baseDiff: ContaineredSprite;
    overlay: ContaineredSprite;
    overlayDiff: ContaineredSprite;

    tint: ColorSource;

    constructor({
        max,
        icon,
        tint,
        overlayTint,
        diffTint,

        split = false,
    }: StatBarOptions) {
        this.max = max;
        this.split = split;

        this.tint = tint;

        this.displayAmount = 0;
        this.amount = 0;

        this.icon = SpriteFactory.build(icon);
        this.icon.anchor.set(0.5);
        this.icon.scale.set(0.2);

        this.outline = SpriteFactory.build("stat_bar_outline");
        this.outline.anchor.set(0, 0.5);
        this.outline.scale.set(0.95);
        this.outline.tint = tint;

        this.circle = SpriteFactory.build("stat_bar_circle");
        this.circle.anchor.set(0.5);
        this.circle.scale.set(0.2);
        this.circle.tint = tint;

        this.container = new Container();
        this.container.scale.set(175);
        this.container.pivot.set(
            this.container.width / 2,
            this.container.height / 2
        );

        this.base = SpriteFactory.build("stat_bar");
        this.base.scale.set(0.1, 0.6);
        this.base.anchor.set(0, 0.5);
        this.base.tint = tint;

        this.baseDiff = SpriteFactory.build("stat_bar");
        this.baseDiff.scale.set(0.1, 0.6);
        this.baseDiff.anchor.set(0, 0.5);
        this.baseDiff.tint = diffTint;

        this.overlay = SpriteFactory.build("stat_bar");
        this.overlay.scale.set(0.1, 0.6);
        this.overlay.anchor.set(0, 0.5);
        this.overlay.tint = overlayTint;

        this.overlayDiff = SpriteFactory.build("stat_bar");
        this.overlayDiff.scale.set(0.1, 0.6);
        this.overlayDiff.anchor.set(0, 0.5);
        this.overlayDiff.tint = diffTint;

        this.container.addChild(this.baseDiff);
        this.container.addChild(this.base);
        this.container.addChild(this.overlayDiff);
        this.container.addChild(this.overlay);
        this.container.addChild(this.outline);
        this.container.addChild(this.circle);
        this.container.addChild(this.icon);
    }

    update(amount: number) {
        this.amount = clamp(amount, 0, this.max);
    }

    /** Lerp bar widths toward the current amount. */
    tick() {
        const width = 1 - 0.07;
        const buffer = 0;
        let base: number;
        let overlay: number;
        if (this.split) {
            base = clamp(this.amount / (this.max / 2), 0, 1) * width + buffer;
            overlay =
                clamp((this.amount - this.max / 2) / (this.max / 2), 0, 1) *
                    width +
                buffer;
        } else {
            base = clamp(this.amount / this.max, 0, 1) * width + buffer;
            overlay = buffer;
        }

        this.base.width = lerp(this.base.width, base, 0.05);
        if (Math.abs(this.base.width - base) < 2) {
            this.baseDiff.width = lerp(this.baseDiff.width, base, 0.02);
        }
        this.overlay.width = lerp(this.overlay.width, overlay, 0.05);
        if (Math.abs(this.overlay.width - overlay) < 2) {
            this.overlayDiff.width = lerp(
                this.overlayDiff.width,
                overlay,
                0.02
            );
        }
    }
}
