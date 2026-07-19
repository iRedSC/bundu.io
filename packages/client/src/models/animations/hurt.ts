import { colorLerp } from "@bundu/shared/transforms";
import { ColorMatrixFilter, type ColorSource } from "pixi.js";
import { Animation } from "../../animation/runtime";
import type { PartNode } from "../types";
import type { ContaineredSprite } from "../../assets/sprite_factory";

type Tintable = ContaineredSprite & { tint: ColorSource };

/** Set just before triggering hurt — consumed on first keyframe. */
let pendingFlash: number | undefined;

export function setHurtFlash(color: number): void {
    pendingFlash = color;
}

/** Multiply tint can't brighten — near-white uses a brightness filter instead. */
function isNearWhite(color: number): boolean {
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    return Math.min(r, g, b) > 220;
}

/** Tint / brightness flash on part visuals. */
export function hurt(nodes: PartNode[]) {
    const targets: Tintable[] = nodes.map((node) => node.visual);
    const animation = new Animation();
    let tints: number[] = [];
    let flash = 0xff0000;
    let bright = false;
    let filters: ColorMatrixFilter[] = [];

    animation.keyframes[0] = (a) => {
        if (a.isFirstKeyframe) {
            tints = targets.map((target) => Number(target.tint));
            flash = pendingFlash ?? 0xff0000;
            pendingFlash = undefined;
            bright = isNearWhite(flash);
            if (bright) {
                filters = targets.map((target) => {
                    const filter = new ColorMatrixFilter();
                    const existing = target.filters ? [...target.filters] : [];
                    target.filters = [...existing, filter];
                    return filter;
                });
            }
            a.goto(0, 100);
        }
        if (bright) {
            const amount = 1 + a.t * 1.35;
            for (const filter of filters) filter.brightness(amount, false);
        } else {
            for (const [i, target] of targets.entries()) {
                target.tint = colorLerp(tints[i]!, flash, a.t);
            }
        }
        if (a.keyframeEnded) a.next(400);
    };

    animation.keyframes[1] = (a) => {
        if (bright) {
            const amount = 1 + (1 - a.t) * 1.35;
            for (const filter of filters) filter.brightness(amount, false);
        } else {
            for (const [i, target] of targets.entries()) {
                target.tint = colorLerp(flash, tints[i] ?? 0xffffff, a.t);
            }
        }
        if (a.keyframeEnded) a.expired = true;
    };

    animation.cleanup = () => {
        for (const [i, target] of targets.entries()) {
            target.tint = tints[i] ?? 0xffffff;
        }
        for (const [i, filter] of filters.entries()) {
            const target = targets[i];
            if (!target?.filters) {
                filter.destroy();
                continue;
            }
            target.filters = target.filters.filter((entry) => entry !== filter);
            filter.destroy();
        }
        filters = [];
    };

    return animation;
}
