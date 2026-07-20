import type { OceanFxConfig } from "@bundu/shared/client_gameplay";
import { parseHexColor } from "@bundu/shared/ground_models";

/**
 * Live ocean FX tuning from pack `gameplay.yml`.
 * Defaults match the bundu pack so the module is safe before packs sync.
 */
export let oceanFx: OceanFxConfig = {
    caustics: {
        a: {
            tint: "#366888",
            alpha: 0.055,
            tileScale: 2.4,
            scroll: { x: 12, y: 8 },
        },
        b: {
            tint: "#8cc3e8",
            alpha: 0.045,
            tileScale: 1.15,
            scroll: { x: -9, y: 11 },
        },
    },
    swell: {
        big: { world: 720, alpha: 0.4, scroll: { x: 28, y: 18 } },
        small: { world: 280, alpha: 0.18, scroll: { x: 42, y: 27 } },
    },
    displaceStrength: 140,
    wake: {
        max: 300,
        lifeMs: 5000,
        idle: { startSize: 160, growSpeed: 160 },
        move: { startSize: 90, growSpeed: 240 },
    },
    splash: {
        max: 300,
        strength: 14,
        spreadDeg: 100,
        friction: 4.5,
        speedMin: 1.7,
        speedMax: 2.1,
        sizeMin: 50,
        sizeMax: 88,
        sizeEnd: 12,
        peakAt: 0.35,
    },
    particles: {
        foamIntervalMs: [180, 400],
        sparkleIntervalMs: [280, 600],
        shoreFilterMs: 250,
    },
    heavyArea: 2_800 * 2_800,
    particleMaxArea: 6_000 * 6_000,
};

export function applyOceanFx(config: OceanFxConfig): void {
    oceanFx = config;
}

export function oceanTint(hex: string): number {
    return parseHexColor(hex);
}
