import type { AmbientParticlesConfig } from "@bundu/shared/client_gameplay";
import { ambientPeriodRate } from "@bundu/shared/client_gameplay";

/**
 * Live ambient particle tuning from pack `gameplay.yml`.
 * Defaults match an empty ambience so the module is safe before packs sync.
 */
export let ambientFx: AmbientParticlesConfig = {
    particleMaxArea: 36_000_000,
    wind: { x: 18, y: 2 },
    periodRates: {
        morning: {},
        day: {},
        evening: {},
        night: {},
    },
    leaves: {},
};

export function applyAmbientFx(config: AmbientParticlesConfig): void {
    ambientFx = config;
}

/** Period index → rate for a named channel (`water_sparkle`, …). Default 1. */
export function ambientRate(period: number, channel: string): number {
    return ambientPeriodRate(ambientFx, period, channel);
}
