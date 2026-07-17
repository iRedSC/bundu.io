import type {
    ClientGameplayConfig,
    DayPeriodOffset,
} from "@bundu/shared/client_gameplay";
import {
    parseClientGameplayConfig,
} from "@bundu/shared/client_gameplay";

/** Global drop-shadow look — pack defaults applied via {@link applyClientGameplay}. */
export type ShadowStyle = {
    alpha: number;
    /**
     * Live screen-space offset (× part scale).
     * Driven by time-of-day from {@link offsetByPeriod}.
     */
    offsetX: number;
    offsetY: number;
    /**
     * Screen offset per day period, matching sky order:
     * morning, day, evening, night.
     */
    offsetByPeriod: [
        DayPeriodOffset,
        DayPeriodOffset,
        DayPeriodOffset,
        DayPeriodOffset,
    ];
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
    offsetX: 0.1,
    offsetY: 0.12,
    offsetByPeriod: [
        { x: 0.1, y: 0.12 },
        { x: 0, y: 0.1 },
        { x: -0.1, y: 0.12 },
        { x: 0, y: 0.06 },
    ],
    soften: 0,
    lights: {
        radius: 220,
        strength: 0,
        sources: {},
    },
};

export function setShadowStyle(patch: Partial<ShadowStyle>): void {
    if (patch.alpha !== undefined) shadowStyle.alpha = patch.alpha;
    if (patch.offsetX !== undefined) shadowStyle.offsetX = patch.offsetX;
    if (patch.offsetY !== undefined) shadowStyle.offsetY = patch.offsetY;
    if (patch.offsetByPeriod !== undefined) {
        shadowStyle.offsetByPeriod = patch.offsetByPeriod;
    }
    if (patch.soften !== undefined) shadowStyle.soften = patch.soften;
    if (patch.lights !== undefined) shadowStyle.lights = patch.lights;
}

function applyShadows(config: ClientGameplayConfig["shadows"]): void {
    shadowStyle.alpha = config.alpha;
    shadowStyle.soften = config.soften;
    shadowStyle.lights = config.lights;
    shadowStyle.offsetByPeriod = [
        config.offsetByPeriod.morning,
        config.offsetByPeriod.day,
        config.offsetByPeriod.evening,
        config.offsetByPeriod.night,
    ];
    const initial = shadowStyle.offsetByPeriod[0];
    shadowStyle.offsetX = initial?.x ?? 0;
    shadowStyle.offsetY = initial?.y ?? 0;
}

/** Apply pack-authored client gameplay (`assets/<ns>/gameplay.yml`). */
export function applyClientGameplay(raw: unknown): ClientGameplayConfig {
    const config = parseClientGameplayConfig(raw);
    applyShadows(config.shadows);
    return config;
}

/** Period index → configured offset (clamped). */
export function shadowOffsetForPeriod(period: number): DayPeriodOffset {
    const { offsetByPeriod } = shadowStyle;
    return offsetByPeriod[period] ?? offsetByPeriod[0] ?? { x: 0, y: 0 };
}

/**
 * Sum of falloff-weighted directions from lights toward the caster.
 * Opposite of this vector is where the shadow is pushed; surrounds cancel.
 * Weight uses a steep near-field curve so close lights shove harder.
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
        // Quartic near-field: ~0 at edge, ramps hard as you approach the source.
        const weight = t * t * t * t * light.intensity;
        pushX += (dx / dist) * weight;
        pushY += (dy / dist) * weight;
    }
    const mag = Math.hypot(pushX, pushY);
    if (mag < 1e-6) return { x: 0, y: 0 };
    // Soft cap above 1 so stacked close lights can push a bit further.
    const capped = mag > 1.75 ? 1.75 / mag : 1;
    const scale = strength * capped;
    return { x: pushX * scale, y: pushY * scale };
}
