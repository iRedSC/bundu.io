import type { ClientGameplayConfig } from "@bundu/shared/client_gameplay";
import {
    parseClientGameplayConfig,
} from "@bundu/shared/client_gameplay";

/** Global drop-shadow look — pack defaults applied via {@link applyClientGameplay}. */
export type ShadowStyle = {
    alpha: number;
    /** Screen-down offset in local units (× part sprite/tile scale). */
    offset: number;
    /**
     * Live screen-space horizontal offset (× part scale).
     * Driven by time-of-day from {@link offsetXByPeriod}.
     */
    offsetX: number;
    /**
     * Horizontal screen offset per day period, matching sky order:
     * morning, day, evening, night.
     */
    offsetXByPeriod: [number, number, number, number];
    /** Blur strength (0 = sharp). Applied live to all shadows. */
    soften: number;
    lights: {
        radius: number;
        strength: number;
        /** Structure visual id → relative intensity. */
        sources: Readonly<Record<string, number>>;
    };
};

export type ShadowLight = {
    x: number;
    y: number;
    intensity: number;
};

export const shadowStyle: ShadowStyle = {
    alpha: 0.28,
    offset: 0.12,
    offsetX: 0.1,
    offsetXByPeriod: [0.1, 0, -0.1, 0],
    soften: 0,
    lights: {
        radius: 220,
        strength: 0,
        sources: {},
    },
};

export function setShadowStyle(patch: Partial<ShadowStyle>): void {
    if (patch.alpha !== undefined) shadowStyle.alpha = patch.alpha;
    if (patch.offset !== undefined) shadowStyle.offset = patch.offset;
    if (patch.offsetX !== undefined) shadowStyle.offsetX = patch.offsetX;
    if (patch.offsetXByPeriod !== undefined) {
        shadowStyle.offsetXByPeriod = patch.offsetXByPeriod;
    }
    if (patch.soften !== undefined) shadowStyle.soften = patch.soften;
    if (patch.lights !== undefined) shadowStyle.lights = patch.lights;
}

function applyShadows(config: ClientGameplayConfig["shadows"]): void {
    shadowStyle.alpha = config.alpha;
    shadowStyle.offset = config.offset;
    shadowStyle.soften = config.soften;
    shadowStyle.lights = config.lights;
    shadowStyle.offsetXByPeriod = [
        config.offsetXByPeriod.morning,
        config.offsetXByPeriod.day,
        config.offsetXByPeriod.evening,
        config.offsetXByPeriod.night,
    ];
    shadowStyle.offsetX = shadowStyle.offsetXByPeriod[0];
}

/** Apply pack-authored client gameplay (`assets/<ns>/gameplay.yml`). */
export function applyClientGameplay(raw: unknown): ClientGameplayConfig {
    const config = parseClientGameplayConfig(raw);
    applyShadows(config.shadows);
    return config;
}

/** Period index → configured horizontal offset (clamped). */
export function shadowOffsetXForPeriod(period: number): number {
    const { offsetXByPeriod } = shadowStyle;
    return offsetXByPeriod[period] ?? offsetXByPeriod[0] ?? 0;
}

/**
 * Sum of falloff-weighted directions from lights toward the caster.
 * Opposite of this vector is where the shadow is pushed; surrounds cancel.
 */
export function lightPushAt(
    x: number,
    y: number,
    lights: readonly ShadowLight[]
): { x: number; y: number } {
    const { radius, strength } = shadowStyle.lights;
    if (strength <= 0 || lights.length === 0 || radius <= 0) {
        return { x: 0, y: 0 };
    }
    let pushX = 0;
    let pushY = 0;
    for (const light of lights) {
        const dx = x - light.x;
        const dy = y - light.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 1e-3 || dist > radius) continue;
        const t = 1 - dist / radius;
        const weight = t * t * light.intensity;
        pushX += (dx / dist) * weight;
        pushY += (dy / dist) * weight;
    }
    const mag = Math.hypot(pushX, pushY);
    if (mag < 1e-6) return { x: 0, y: 0 };
    // Cap at unit length so many lights don't explode the offset.
    const scale = strength * (mag > 1 ? 1 / mag : 1);
    return { x: pushX * scale, y: pushY * scale };
}
