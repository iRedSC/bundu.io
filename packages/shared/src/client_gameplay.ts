/** Pack-authored client gameplay (`assets/<ns>/gameplay.yml`). */
export type DayPeriodOffset = { x: number; y: number };

export type Scroll2 = { x: number; y: number };

export type OceanCausticLayer = {
    tint: string;
    alpha: number;
    tileScale: number;
    scroll: Scroll2;
};

export type OceanSwellLayer = {
    world: number;
    alpha: number;
    scroll: Scroll2;
};

export type OceanWakeKind = {
    startSize: number;
    growSpeed: number;
};

/** Viewport ocean FX tuning (textures live on the ocean ground model). */
export type OceanFxConfig = {
    caustics: { a: OceanCausticLayer; b: OceanCausticLayer };
    swell: { big: OceanSwellLayer; small: OceanSwellLayer };
    displaceStrength: number;
    wake: {
        max: number;
        lifeMs: number;
        idle: OceanWakeKind;
        move: OceanWakeKind;
    };
    splash: {
        max: number;
        strength: number;
        spreadDeg: number;
        friction: number;
        speedMin: number;
        speedMax: number;
        sizeMin: number;
        sizeMax: number;
        /** Optional mid-life peak; omit for linear size→sizeEnd. */
        peakSizeMin?: number;
        peakSizeMax?: number;
        /** Lifetime progress [0,1] when peak is reached. */
        peakAt: number;
        sizeEnd: number;
    };
    particles: {
        foamIntervalMs: [number, number];
        sparkleIntervalMs: [number, number];
        shoreFilterMs: number;
    };
    /** Soften heavy FX past this view area (world²). */
    heavyArea: number;
    /** Skip ambient particles past this view area (world²). */
    particleMaxArea: number;
};

export type ClientGameplayConfig = {
    shadows: {
        alpha: number;
        /** Blur strength (0 = sharp). Pixi BlurFilter strength. */
        soften: number;
        offsetByPeriod: {
            morning: DayPeriodOffset;
            day: DayPeriodOffset;
            evening: DayPeriodOffset;
            night: DayPeriodOffset;
        };
        lights: {
            /** Max distance a light can push a shadow. */
            radius: number;
            /** Max world-pixel push for a unit-weight direction. */
            strength: number;
            /** Structure visual id → relative intensity. */
            sources: Readonly<Record<string, number>>;
        };
    };
    ocean: OceanFxConfig;
};

const DAY_PERIOD_NAMES = ["morning", "day", "evening", "night"] as const;
type DayPeriodName = (typeof DAY_PERIOD_NAMES)[number];

const HEX = /^#[0-9a-fA-F]{6}$/;

function record(value: unknown, path: string): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`${path}: expected an object`);
    }
    return value as Record<string, unknown>;
}

function number(source: Record<string, unknown>, key: string, path: string): number {
    const value = source[key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`${path}.${key}: expected a finite number`);
    }
    return value;
}

function positive(source: Record<string, unknown>, key: string, path: string): number {
    const value = number(source, key, path);
    if (value <= 0) throw new Error(`${path}.${key}: must be > 0`);
    return value;
}

function hexColor(value: unknown, path: string): string {
    if (typeof value !== "string" || !HEX.test(value)) {
        throw new Error(`${path}: expected #rrggbb`);
    }
    return value.toLowerCase();
}

function scroll2(value: unknown, path: string): Scroll2 {
    const raw = record(value, path);
    return { x: number(raw, "x", path), y: number(raw, "y", path) };
}

function intervalMs(value: unknown, path: string): [number, number] {
    if (!Array.isArray(value) || value.length !== 2) {
        throw new Error(`${path}: expected [min, max]`);
    }
    const [lo, hi] = value;
    if (
        typeof lo !== "number" ||
        typeof hi !== "number" ||
        !Number.isFinite(lo) ||
        !Number.isFinite(hi) ||
        lo < 0 ||
        hi < lo
    ) {
        throw new Error(`${path}: expected 0 <= min <= max`);
    }
    return [lo, hi];
}

function parsePeriodOffset(value: unknown, path: string): DayPeriodOffset {
    const raw = record(value, path);
    return {
        x: number(raw, "x", path),
        y: number(raw, "y", path),
    };
}

function parseLights(
    value: Record<string, unknown>
): ClientGameplayConfig["shadows"]["lights"] {
    const path = "client_gameplay.shadows.lights";
    const radius = number(value, "radius", path);
    const strength = number(value, "strength", path);
    if (radius <= 0) throw new Error(`${path}.radius: must be > 0`);
    if (strength < 0) throw new Error(`${path}.strength: expected >= 0`);
    const rawSources = record(value.sources, `${path}.sources`);
    const sources: Record<string, number> = {};
    for (const [id, raw] of Object.entries(rawSources)) {
        if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) {
            throw new Error(`${path}.sources.${id}: expected a positive number`);
        }
        sources[id] = raw;
    }
    if (Object.keys(sources).length === 0) {
        throw new Error(`${path}.sources: expected at least one structure`);
    }
    return { radius, strength, sources };
}

function parseShadows(
    value: Record<string, unknown>
): ClientGameplayConfig["shadows"] {
    const path = "client_gameplay.shadows";
    const alpha = number(value, "alpha", path);
    const soften = number(value, "soften", path);
    if (alpha < 0 || alpha > 1) {
        throw new Error(`${path}.alpha: expected 0..1`);
    }
    if (soften < 0) {
        throw new Error(`${path}.soften: expected >= 0`);
    }
    const rawOffsets = record(
        value.offset_by_period,
        `${path}.offset_by_period`
    );
    const unexpected = Object.keys(rawOffsets).filter(
        (key) => !DAY_PERIOD_NAMES.includes(key as DayPeriodName)
    );
    if (unexpected.length > 0) {
        throw new Error(
            `${path}.offset_by_period: unknown period(s) ${unexpected
                .map((key) => `"${key}"`)
                .join(", ")}`
        );
    }
    const offsetByPeriod = {
        morning: { x: 0, y: 0 },
        day: { x: 0, y: 0 },
        evening: { x: 0, y: 0 },
        night: { x: 0, y: 0 },
    };
    for (const name of DAY_PERIOD_NAMES) {
        if (!(name in rawOffsets)) {
            throw new Error(`${path}.offset_by_period.${name}: missing period`);
        }
        offsetByPeriod[name] = parsePeriodOffset(
            rawOffsets[name],
            `${path}.offset_by_period.${name}`
        );
    }
    return {
        alpha,
        soften,
        offsetByPeriod,
        lights: parseLights(record(value.lights, `${path}.lights`)),
    };
}

function parseCausticLayer(value: unknown, path: string): OceanCausticLayer {
    const raw = record(value, path);
    const alpha = number(raw, "alpha", path);
    if (alpha < 0 || alpha > 1) throw new Error(`${path}.alpha: expected 0..1`);
    return {
        tint: hexColor(raw.tint, `${path}.tint`),
        alpha,
        tileScale: positive(raw, "tile_scale", path),
        scroll: scroll2(raw.scroll, `${path}.scroll`),
    };
}

function parseSwellLayer(value: unknown, path: string): OceanSwellLayer {
    const raw = record(value, path);
    const alpha = number(raw, "alpha", path);
    if (alpha < 0 || alpha > 1) throw new Error(`${path}.alpha: expected 0..1`);
    return {
        world: positive(raw, "world", path),
        alpha,
        scroll: scroll2(raw.scroll, `${path}.scroll`),
    };
}

function parseWakeKind(value: unknown, path: string): OceanWakeKind {
    const raw = record(value, path);
    return {
        startSize: positive(raw, "start_size", path),
        growSpeed: positive(raw, "grow_speed", path),
    };
}

function parseOcean(value: Record<string, unknown>): OceanFxConfig {
    const path = "client_gameplay.ocean";
    const caustics = record(value.caustics, `${path}.caustics`);
    const swell = record(value.swell, `${path}.swell`);
    const wake = record(value.wake, `${path}.wake`);
    const splash = record(value.splash, `${path}.splash`);
    const particles = record(value.particles, `${path}.particles`);
    const heavy = positive(value, "heavy_area", path);
    const particleMax = positive(value, "particle_max_area", path);
    return {
        caustics: {
            a: parseCausticLayer(caustics.a, `${path}.caustics.a`),
            b: parseCausticLayer(caustics.b, `${path}.caustics.b`),
        },
        swell: {
            big: parseSwellLayer(swell.big, `${path}.swell.big`),
            small: parseSwellLayer(swell.small, `${path}.swell.small`),
        },
        displaceStrength: positive(value, "displace_strength", path),
        wake: {
            max: positive(wake, "max", `${path}.wake`),
            lifeMs: positive(wake, "life_ms", `${path}.wake`),
            idle: parseWakeKind(wake.idle, `${path}.wake.idle`),
            move: parseWakeKind(wake.move, `${path}.wake.move`),
        },
        splash: (() => {
            const speedMin = positive(splash, "speed_min", `${path}.splash`);
            const speedMax = positive(splash, "speed_max", `${path}.splash`);
            if (speedMin > speedMax) {
                throw new Error(
                    `${path}.splash: speed_min must be <= speed_max`
                );
            }
            const sizeMin = positive(splash, "size_min", `${path}.splash`);
            const sizeMax = positive(splash, "size_max", `${path}.splash`);
            if (sizeMin > sizeMax) {
                throw new Error(
                    `${path}.splash: size_min must be <= size_max`
                );
            }
            const hasPeak =
                splash.peak_size_min !== undefined ||
                splash.peak_size_max !== undefined;
            let peakSizeMin: number | undefined;
            let peakSizeMax: number | undefined;
            if (hasPeak) {
                peakSizeMin = positive(
                    splash,
                    "peak_size_min",
                    `${path}.splash`
                );
                peakSizeMax = positive(
                    splash,
                    "peak_size_max",
                    `${path}.splash`
                );
                if (peakSizeMin > peakSizeMax) {
                    throw new Error(
                        `${path}.splash: peak_size_min must be <= peak_size_max`
                    );
                }
            }
            const peakAt =
                splash.peak_at !== undefined
                    ? number(splash, "peak_at", `${path}.splash`)
                    : 0.35;
            if (peakAt < 0 || peakAt > 1) {
                throw new Error(`${path}.splash.peak_at: expected 0..1`);
            }
            return {
                max: positive(splash, "max", `${path}.splash`),
                strength: positive(splash, "strength", `${path}.splash`),
                spreadDeg: positive(splash, "spread_deg", `${path}.splash`),
                friction: positive(splash, "friction", `${path}.splash`),
                speedMin,
                speedMax,
                sizeMin,
                sizeMax,
                peakSizeMin,
                peakSizeMax,
                peakAt,
                sizeEnd: positive(splash, "size_end", `${path}.splash`),
            };
        })(),
        particles: {
            foamIntervalMs: intervalMs(
                particles.foam_interval_ms,
                `${path}.particles.foam_interval_ms`
            ),
            sparkleIntervalMs: intervalMs(
                particles.sparkle_interval_ms,
                `${path}.particles.sparkle_interval_ms`
            ),
            shoreFilterMs: positive(
                particles,
                "shore_filter_ms",
                `${path}.particles`
            ),
        },
        heavyArea: heavy,
        particleMaxArea: particleMax,
    };
}

export function parseClientGameplayConfig(value: unknown): ClientGameplayConfig {
    const root = record(value, "client_gameplay");
    return {
        shadows: parseShadows(record(root.shadows, "client_gameplay.shadows")),
        ocean: parseOcean(record(root.ocean, "client_gameplay.ocean")),
    };
}
