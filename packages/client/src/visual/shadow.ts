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
};

export const shadowStyle: ShadowStyle = {
    alpha: 0.28,
    offset: 0.12,
    offsetX: 0.1,
    offsetXByPeriod: [0.1, 0, -0.1, 0],
    soften: 0,
};

export function setShadowStyle(patch: Partial<ShadowStyle>): void {
    if (patch.alpha !== undefined) shadowStyle.alpha = patch.alpha;
    if (patch.offset !== undefined) shadowStyle.offset = patch.offset;
    if (patch.offsetX !== undefined) shadowStyle.offsetX = patch.offsetX;
    if (patch.offsetXByPeriod !== undefined) {
        shadowStyle.offsetXByPeriod = patch.offsetXByPeriod;
    }
    if (patch.soften !== undefined) shadowStyle.soften = patch.soften;
}

function applyShadows(config: ClientGameplayConfig["shadows"]): void {
    shadowStyle.alpha = config.alpha;
    shadowStyle.offset = config.offset;
    shadowStyle.soften = config.soften;
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
