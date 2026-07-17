/** Pack-authored client gameplay (`assets/<ns>/gameplay.yml`). */
export type ClientGameplayConfig = {
    shadows: {
        alpha: number;
        offset: number;
        /** Blur strength (0 = sharp). Pixi BlurFilter strength. */
        soften: number;
        offsetXByPeriod: {
            morning: number;
            day: number;
            evening: number;
            night: number;
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

function parseShadows(
    value: Record<string, unknown>
): ClientGameplayConfig["shadows"] {
    const path = "client_gameplay.shadows";
    const alpha = number(value, "alpha", path);
    const offset = number(value, "offset", path);
    const soften = number(value, "soften", path);
    if (alpha < 0 || alpha > 1) {
        throw new Error(`${path}.alpha: expected 0..1`);
    }
    if (soften < 0) {
        throw new Error(`${path}.soften: expected >= 0`);
    }
    const rawOffsets = record(
        value.offset_x_by_period,
        `${path}.offset_x_by_period`
    );
    const unexpected = Object.keys(rawOffsets).filter(
        (key) => !DAY_PERIOD_NAMES.includes(key as DayPeriodName)
    );
    if (unexpected.length > 0) {
        throw new Error(
            `${path}.offset_x_by_period: unknown period(s) ${unexpected
                .map((key) => `"${key}"`)
                .join(", ")}`
        );
    }
    const offsetXByPeriod = {
        morning: 0,
        day: 0,
        evening: 0,
        night: 0,
    };
    for (const name of DAY_PERIOD_NAMES) {
        if (!(name in rawOffsets)) {
            throw new Error(`${path}.offset_x_by_period.${name}: missing period`);
        }
        offsetXByPeriod[name] = number(
            rawOffsets,
            name,
            `${path}.offset_x_by_period`
        );
    }
    return { alpha, offset, soften, offsetXByPeriod };
}

export function parseClientGameplayConfig(value: unknown): ClientGameplayConfig {
    const root = record(value, "client_gameplay");
    return {
        shadows: parseShadows(record(root.shadows, "client_gameplay.shadows")),
    };
}
