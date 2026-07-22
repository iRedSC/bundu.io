import type { GroundFxRange } from "./ground_models";

/** Pack-authored client gameplay (`assets/<ns>/gameplay.yml`). */
export type DayPeriodOffset = { x: number; y: number };

export const DAY_PERIOD_NAMES = ["morning", "day", "evening", "night"] as const;
export type DayPeriodName = (typeof DAY_PERIOD_NAMES)[number];

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

/** Period → named rate multipliers (e.g. water_sparkle). */
export type AmbientPeriodRates = Readonly<Record<string, number>>;

/**
 * Leaf preset — trees come from pack tags (`decoration_tag` / `resource_tag`).
 * Multiple presets = multiple leaf types.
 */
export type AmbientLeafPreset = {
    /** Decoration registry tag, e.g. `#bundu:leaves_forest`. */
    decorationTag?: string;
    /** Resource registry tag for harvestable trees. */
    resourceTag?: string;
    intervalMs: readonly [min: number, max: number];
    /** Omit = all periods. */
    periods?: readonly DayPeriodName[];
    count: GroundFxRange;
    size: GroundFxRange;
    alpha: GroundFxRange;
    lifetime: GroundFxRange;
    speed: GroundFxRange;
    spread: number;
    friction: number;
    gravity: number;
    gravityX: number;
    endSize: number;
    tint: string;
    blendMode: "normal" | "add" | "screen";
    alphaFadeIn: number;
    alphaHold: number;
    spin: GroundFxRange;
    /** Spawn jitter radius around the tree (world px). */
    spawnRadius: number;
    zIndex?: number;
};

export type AmbientParticlesConfig = {
    /** Skip ambience past this view area (world²). */
    particleMaxArea: number;
    /** Global blow bias added to emitter gravityX / gravity. */
    wind: { x: number; y: number };
    /**
     * Per-period rate multipliers for named channels.
     * `water_sparkle` shortens ocean sparkle intervals (higher = more).
     */
    periodRates: {
        morning: AmbientPeriodRates;
        day: AmbientPeriodRates;
        evening: AmbientPeriodRates;
        night: AmbientPeriodRates;
    };
    /** Named leaf types keyed for pack tuning. */
    leaves: Readonly<Record<string, AmbientLeafPreset>>;
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
    ambient: AmbientParticlesConfig;
};

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

const DEFAULT_LEAF: Omit<
    AmbientLeafPreset,
    "decorationTag" | "resourceTag" | "tint" | "periods" | "zIndex"
> = {
    intervalMs: [900, 1800],
    count: 1,
    size: [5, 12],
    alpha: [0.4, 0.18],
    lifetime: [2200, 4000],
    speed: [10, 34],
    spread: 0.9,
    friction: 0.45,
    gravity: 14,
    gravityX: 0,
    endSize: 2,
    blendMode: "normal",
    alphaFadeIn: 0.2,
    alphaHold: 0.55,
    spin: [-2.2, 2.2],
    spawnRadius: 28,
};

function fxRange(value: unknown, path: string): GroundFxRange {
    if (typeof value === "number") {
        if (!Number.isFinite(value) || value < 0) {
            throw new Error(`${path}: expected a non-negative number`);
        }
        return value;
    }
    if (!Array.isArray(value) || value.length !== 2) {
        throw new Error(`${path}: expected a number or [min, max]`);
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

function fxRangeOriented(value: unknown, path: string): GroundFxRange {
    if (typeof value === "number") {
        if (!Number.isFinite(value) || value < 0) {
            throw new Error(`${path}: expected a non-negative number`);
        }
        return value;
    }
    if (!Array.isArray(value) || value.length !== 2) {
        throw new Error(`${path}: expected a number or [a, b]`);
    }
    const [a, b] = value;
    if (
        typeof a !== "number" ||
        typeof b !== "number" ||
        !Number.isFinite(a) ||
        !Number.isFinite(b) ||
        a < 0 ||
        b < 0
    ) {
        throw new Error(`${path}: expected non-negative numbers`);
    }
    return [a, b];
}

function signedRange(value: unknown, path: string): GroundFxRange {
    if (typeof value === "number") {
        if (!Number.isFinite(value)) {
            throw new Error(`${path}: expected a finite number`);
        }
        return value;
    }
    if (!Array.isArray(value) || value.length !== 2) {
        throw new Error(`${path}: expected a number or [min, max]`);
    }
    const [lo, hi] = value;
    if (
        typeof lo !== "number" ||
        typeof hi !== "number" ||
        !Number.isFinite(lo) ||
        !Number.isFinite(hi) ||
        hi < lo
    ) {
        throw new Error(`${path}: expected min <= max`);
    }
    return [lo, hi];
}

function optionalFxRange(
    raw: Record<string, unknown>,
    snake: string,
    camel: string,
    path: string,
    fallback: GroundFxRange
): GroundFxRange {
    const value = raw[snake] ?? raw[camel];
    return value === undefined ? fallback : fxRange(value, `${path}.${snake}`);
}

function optionalNumber(
    raw: Record<string, unknown>,
    snake: string,
    camel: string,
    path: string,
    fallback: number
): number {
    const value = raw[snake] ?? raw[camel];
    if (value === undefined) return fallback;
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`${path}.${snake}: expected a finite number`);
    }
    return value;
}

function parsePeriods(
    value: unknown,
    path: string
): readonly DayPeriodName[] | undefined {
    if (value === undefined) return undefined;
    if (!Array.isArray(value) || value.length === 0) {
        throw new Error(`${path}: expected a non-empty period list`);
    }
    const out: DayPeriodName[] = [];
    for (const [index, entry] of value.entries()) {
        if (
            typeof entry !== "string" ||
            !(DAY_PERIOD_NAMES as readonly string[]).includes(entry)
        ) {
            throw new Error(
                `${path}[${index}]: expected one of ${DAY_PERIOD_NAMES.join(", ")}`
            );
        }
        out.push(entry as DayPeriodName);
    }
    return out;
}

function parsePeriodRates(
    value: unknown,
    path: string
): AmbientPeriodRates {
    if (value === undefined) return {};
    const raw = record(value, path);
    const out: Record<string, number> = {};
    for (const [key, rate] of Object.entries(raw)) {
        if (typeof rate !== "number" || !Number.isFinite(rate) || rate < 0) {
            throw new Error(`${path}.${key}: expected a non-negative number`);
        }
        out[key] = rate;
    }
    return out;
}

function parseLeafPreset(value: unknown, path: string): AmbientLeafPreset {
    const raw = record(value, path);
    const decorationTag = raw.decoration_tag ?? raw.decorationTag;
    const resourceTag = raw.resource_tag ?? raw.resourceTag;
    if (decorationTag === undefined && resourceTag === undefined) {
        throw new Error(
            `${path}: expected decoration_tag and/or resource_tag`
        );
    }
    if (decorationTag !== undefined && typeof decorationTag !== "string") {
        throw new Error(`${path}.decoration_tag: expected a string`);
    }
    if (resourceTag !== undefined && typeof resourceTag !== "string") {
        throw new Error(`${path}.resource_tag: expected a string`);
    }
    const alphaFadeIn =
        raw.alpha_fade_in !== undefined || raw.alphaFadeIn !== undefined
            ? number(
                  raw,
                  "alpha_fade_in" in raw ? "alpha_fade_in" : "alphaFadeIn",
                  path
              )
            : DEFAULT_LEAF.alphaFadeIn;
    const alphaHold =
        raw.alpha_hold !== undefined || raw.alphaHold !== undefined
            ? number(
                  raw,
                  "alpha_hold" in raw ? "alpha_hold" : "alphaHold",
                  path
              )
            : DEFAULT_LEAF.alphaHold;
    if (alphaFadeIn < 0 || alphaFadeIn > 1) {
        throw new Error(`${path}.alpha_fade_in: expected 0..1`);
    }
    if (alphaHold < 0 || alphaHold > 1) {
        throw new Error(`${path}.alpha_hold: expected 0..1`);
    }
    if (alphaHold < alphaFadeIn) {
        throw new Error(`${path}.alpha_hold: must be >= alpha_fade_in`);
    }
    const blendRaw = raw.blend_mode ?? raw.blendMode;
    let blendMode: AmbientLeafPreset["blendMode"] = DEFAULT_LEAF.blendMode;
    if (blendRaw !== undefined) {
        if (blendRaw === "normal" || blendRaw === "add" || blendRaw === "screen") {
            blendMode = blendRaw;
        } else {
            throw new Error(`${path}.blend_mode: expected normal|add|screen`);
        }
    }
    const tint = hexColor(raw.tint ?? "#6b8f3c", `${path}.tint`);
    const alphaRaw = raw.alpha;
    const def: AmbientLeafPreset = {
        intervalMs: intervalMs(
            raw.interval_ms ?? raw.intervalMs ?? DEFAULT_LEAF.intervalMs,
            `${path}.interval_ms`
        ),
        count: optionalFxRange(
            raw,
            "count",
            "count",
            path,
            DEFAULT_LEAF.count
        ),
        size: optionalFxRange(raw, "size", "size", path, DEFAULT_LEAF.size),
        alpha:
            alphaRaw === undefined
                ? DEFAULT_LEAF.alpha
                : fxRangeOriented(alphaRaw, `${path}.alpha`),
        lifetime: optionalFxRange(
            raw,
            "lifetime",
            "lifetime",
            path,
            DEFAULT_LEAF.lifetime
        ),
        speed: optionalFxRange(raw, "speed", "speed", path, DEFAULT_LEAF.speed),
        spread: optionalNumber(
            raw,
            "spread",
            "spread",
            path,
            DEFAULT_LEAF.spread
        ),
        friction: optionalNumber(
            raw,
            "friction",
            "friction",
            path,
            DEFAULT_LEAF.friction
        ),
        gravity: optionalNumber(
            raw,
            "gravity",
            "gravity",
            path,
            DEFAULT_LEAF.gravity
        ),
        gravityX: optionalNumber(
            raw,
            "gravity_x",
            "gravityX",
            path,
            DEFAULT_LEAF.gravityX
        ),
        endSize: optionalNumber(
            raw,
            "end_size",
            "endSize",
            path,
            DEFAULT_LEAF.endSize
        ),
        tint,
        blendMode,
        alphaFadeIn,
        alphaHold,
        spin:
            raw.spin === undefined
                ? DEFAULT_LEAF.spin
                : signedRange(raw.spin, `${path}.spin`),
        spawnRadius: optionalNumber(
            raw,
            "spawn_radius",
            "spawnRadius",
            path,
            DEFAULT_LEAF.spawnRadius
        ),
    };
    if (typeof decorationTag === "string") def.decorationTag = decorationTag;
    if (typeof resourceTag === "string") def.resourceTag = resourceTag;
    const periods = parsePeriods(raw.periods, `${path}.periods`);
    if (periods) def.periods = periods;
    const zRaw = raw.z_index ?? raw.zIndex;
    if (zRaw !== undefined) {
        if (typeof zRaw !== "number" || !Number.isFinite(zRaw)) {
            throw new Error(`${path}.z_index: expected a finite number`);
        }
        def.zIndex = zRaw;
    }
    return def;
}

const DEFAULT_AMBIENT: AmbientParticlesConfig = {
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

function parseAmbient(value: unknown): AmbientParticlesConfig {
    const path = "client_gameplay.ambient_particles";
    const raw = record(value, path);
    const windRaw = record(raw.wind ?? { x: 18, y: 2 }, `${path}.wind`);
    const ratesRaw = record(
        raw.period_rates ?? raw.periodRates ?? {},
        `${path}.period_rates`
    );
    const leavesRaw = record(raw.leaves ?? {}, `${path}.leaves`);
    const leaves: Record<string, AmbientLeafPreset> = {};
    for (const [name, entry] of Object.entries(leavesRaw)) {
        if (!name) throw new Error(`${path}.leaves: empty preset name`);
        leaves[name] = parseLeafPreset(entry, `${path}.leaves.${name}`);
    }
    const periodRates = {
        morning: parsePeriodRates(ratesRaw.morning, `${path}.period_rates.morning`),
        day: parsePeriodRates(ratesRaw.day, `${path}.period_rates.day`),
        evening: parsePeriodRates(
            ratesRaw.evening,
            `${path}.period_rates.evening`
        ),
        night: parsePeriodRates(ratesRaw.night, `${path}.period_rates.night`),
    };
    const maxAreaRaw = raw.particle_max_area ?? raw.particleMaxArea;
    return {
        particleMaxArea:
            maxAreaRaw === undefined
                ? DEFAULT_AMBIENT.particleMaxArea
                : positive(
                      { particle_max_area: maxAreaRaw },
                      "particle_max_area",
                      path
                  ),
        wind: {
            x: number(windRaw, "x", `${path}.wind`),
            y: number(windRaw, "y", `${path}.wind`),
        },
        periodRates,
        leaves,
    };
}

export function parseClientGameplayConfig(value: unknown): ClientGameplayConfig {
    const root = record(value, "client_gameplay");
    return {
        shadows: parseShadows(record(root.shadows, "client_gameplay.shadows")),
        ocean: parseOcean(record(root.ocean, "client_gameplay.ocean")),
        ambient:
            root.ambient_particles !== undefined ||
            root.ambientParticles !== undefined
                ? parseAmbient(root.ambient_particles ?? root.ambientParticles)
                : DEFAULT_AMBIENT,
    };
}

/** Period index → rate multiplier for a named ambient channel (default 1). */
export function ambientPeriodRate(
    config: AmbientParticlesConfig,
    period: number,
    channel: string
): number {
    const name = DAY_PERIOD_NAMES[period];
    if (!name) return 1;
    return config.periodRates[name][channel] ?? 1;
}
