import { Animation } from "../../animation/runtime";
import { getAsset } from "../../assets/load";
import { fireGlow } from "../particles/fire_glow";
import type { AnimContext, PartNode } from "../types";

const LOOP = 400;
const GLOW = "bundu/effect/fire_glow_soft.svg";

/** Continuous soft fire-colored glow particles while the fire is placed. */
export function fireGlowAnim(_nodes: PartNode[], ctx: AnimContext) {
    const animation = new Animation();
    let nextEmitAt = 0;

    animation.keyframes[0] = (active) => {
        if (active.isFirstKeyframe) {
            active.goto(0, LOOP);
            nextEmitAt = active.now;
        }

        const now = active.now;
        if (now >= nextEmitAt && ctx.emitParticles && ctx.particleAnchor) {
            nextEmitAt = now + 50 + Math.random() * 40;
            const origin = ctx.particleAnchor();
            ctx.emitParticles(fireGlow(getAsset(GLOW), origin.x, origin.y));
        }

        if (active.keyframeEnded) active.goto(0, LOOP);
    };

    return animation;
}
