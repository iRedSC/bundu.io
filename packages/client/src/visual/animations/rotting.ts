import { Animation } from "../../animation/runtime";
import { radians } from "@bundu/shared";
import { structureCrumble } from "../particles/structure_crumble";
import type { AnimContext, PartNode } from "../types";

const DURATION = 2_500;
const SHAKE = radians(2.2);

/** Soft continuous shake + sparse crumble while rotting is active. */
export function rotting(nodes: PartNode[], ctx: AnimContext) {
    const animation = new Animation();
    let offset = Math.random() * Math.PI * 2;
    let nextCrumbleAt = 0;

    animation.keyframes[0] = (active) => {
        if (active.isFirstKeyframe) {
            active.goto(0, DURATION);
            nextCrumbleAt = Date.now() + 800 + Math.random() * 700;
        }
        const rotation = Math.sin(active.t * Math.PI * 6 + offset) * SHAKE;
        for (const node of nodes) node.animation.rotation = rotation;

        const now = Date.now();
        if (
            now >= nextCrumbleAt &&
            ctx.emitParticles &&
            ctx.particleAnchor
        ) {
            nextCrumbleAt = now + 800 + Math.random() * 700;
            const origin = ctx.particleAnchor();
            ctx.emitParticles(
                structureCrumble(
                    origin.texture,
                    origin.x,
                    origin.y,
                    origin.radius
                )
            );
        }

        if (active.keyframeEnded) active.goto(0, DURATION);
    };

    animation.cleanup = () => {
        for (const node of nodes) node.animation.rotation = 0;
    };

    return animation;
}
