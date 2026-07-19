import type { ModelFootstepsDef } from "@bundu/shared/models/types";
import type { Texture } from "pixi.js";
import type { ParticleBurst } from "../../../rendering/particles/types";
import { GROUND_PARTICLE_Z } from "./foam";

/** Stationary print under a walking mover (params from the actor model). */
export function landFootstep(
    texture: Texture,
    x: number,
    y: number,
    config: ModelFootstepsDef,
    /** Soft-circle prints are dark; custom textures keep their own colors. */
    tint = 0x1a1a1a
): ParticleBurst {
    const endSize =
        typeof config.size === "number"
            ? config.size * 0.9
            : ((config.size[0] + config.size[1]) / 2) * 0.9;
    return {
        texture,
        x,
        y,
        direction: 0,
        count: 1,
        spread: 0,
        speed: 0,
        lifetime: config.lifetime,
        size: config.size,
        endSize,
        sizeEndAt: 1,
        friction: 0,
        tint,
        alpha: config.alpha,
        alphaHold: config.fadeAt,
        zIndex: GROUND_PARTICLE_Z,
    };
}
