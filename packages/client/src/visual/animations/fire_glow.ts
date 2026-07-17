import { Animation } from "../../animation/runtime";
import { getAsset } from "../../assets/load";
import { fireGlow } from "../particles/fire_glow";
import { fireSmoke } from "../particles/fire_smoke";
import type { AnimContext, PartNode } from "../types";

const LOOP = 400;
const GLOW = "bundu/effect/fire_glow_soft.png";
const SMOKE = "bundu/effect/fire_smoke_soft.png";

/** Continuous ember glow + slow rising smoke while the fire is placed. */
export function fireGlowAnim(_nodes: PartNode[], ctx: AnimContext) {
    const animation = new Animation();
    let nextGlowAt = 0;
    let nextSmokeAt = 0;

    animation.keyframes[0] = (active) => {
        if (active.isFirstKeyframe) {
            active.goto(0, LOOP);
            nextGlowAt = active.now;
            nextSmokeAt = active.now + 200;
        }

        const now = active.now;
        if (ctx.emitParticles && ctx.particleAnchor) {
            const origin = ctx.particleAnchor();
            if (now >= nextGlowAt) {
                nextGlowAt = now + 50 + Math.random() * 40;
                ctx.emitParticles(fireGlow(getAsset(GLOW), origin.x, origin.y));
            }
            if (now >= nextSmokeAt) {
                nextSmokeAt = now + 800 + Math.random() * 140;
                ctx.emitParticles(
                    fireSmoke(getAsset(SMOKE), origin.x, origin.y)
                );
            }
        }

        if (active.keyframeEnded) active.goto(0, LOOP);
    };

    return animation;
}
