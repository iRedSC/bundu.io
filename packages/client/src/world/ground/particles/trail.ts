import type { GroundTrailDef } from "@bundu/shared/ground_models";
import { jitterLandColor } from "@bundu/shared/ground_models";
import type { Texture } from "pixi.js";
import type { NumberRange, ParticleBurst } from "../../../rendering/particles/types";
import { GROUND_PARTICLE_Z } from "./foam";

function sampleAmount(amount: NumberRange): number {
    if (typeof amount === "number") return Math.max(1, Math.round(amount));
    const lo = Math.ceil(amount[0]);
    const hi = Math.floor(amount[1]);
    return Math.max(1, lo + Math.floor(Math.random() * (hi - lo + 1)));
}

/**
 * Debris kicked up while moving — each speck jittered from the land color.
 * Spawn positions are scattered across `hitboxDiameter`.
 */
export function landTrailBursts(
    texture: Texture,
    x: number,
    y: number,
    direction: number,
    landColor: number,
    hitboxDiameter: number,
    config: GroundTrailDef
): ParticleBurst[] {
    const count = sampleAmount(config.amount);
    const bursts: ParticleBurst[] = [];
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * (hitboxDiameter * 0.5);
        bursts.push({
            texture,
            x: x + Math.cos(angle) * radius,
            y: y + Math.sin(angle) * radius,
            direction,
            count: 1,
            spread: config.spread,
            speed: config.speed,
            lifetime: config.lifetime,
            size: config.size,
            endSize: config.endSize,
            friction: config.friction,
            gravity: config.gravity,
            tint: jitterLandColor(landColor, config.colorJitter),
            zIndex: GROUND_PARTICLE_Z,
        });
    }
    return bursts;
}
