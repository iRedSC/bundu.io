/** Pack-authored client gameplay (`assets/<ns>/gameplay.yml`). */
export type DayPeriodOffset = { x: number; y: number };

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
};

const DAY_PERIOD_NAMES = ["morning", "day", "evening", "night"] as const;
type DayPeriodName = (typeof DAY_PERIOD_NAMES)[number];

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

export function parseClientGameplayConfig(value: unknown): ClientGameplayConfig {
    const root = record(value, "client_gameplay");
    return {
        shadows: parseShadows(record(root.shadows, "client_gameplay.shadows")),
    };
}
