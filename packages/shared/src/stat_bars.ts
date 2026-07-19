/** Pack-authored client stat bars (`assets/<ns>/stat_bars.yml`). */

export type StatBarColors = {
    base: string;
    overlay: string;
    diff: string;
    flashBase: string;
    flashOverlay: string;
};

export type StatBarGradientStop = {
    at: number;
    base: string;
    overlay: string;
};

export type StatBarConfig = {
    max: number;
    split: boolean;
    icon: string;
    colors: StatBarColors;
    shake: number;
    flashBelow?: number;
    flashAbove?: number;
    flashBelowRatio?: number;
    gradient?: StatBarGradientStop[];
};

export type StatBarsConfig = {
    health: StatBarConfig;
    hunger: StatBarConfig;
    heat: StatBarConfig;
    thirst: StatBarConfig;
};

const HEX = /^#[0-9a-fA-F]{6}$/;
const BAR_KEYS = ["health", "hunger", "heat", "thirst"] as const;

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

function boolean(source: Record<string, unknown>, key: string, path: string): boolean {
    const value = source[key];
    if (typeof value !== "boolean") {
        throw new Error(`${path}.${key}: expected a boolean`);
    }
    return value;
}

function string(source: Record<string, unknown>, key: string, path: string): string {
    const value = source[key];
    if (typeof value !== "string" || !value) {
        throw new Error(`${path}.${key}: expected a non-empty string`);
    }
    return value;
}

function hexColor(value: unknown, path: string): string {
    if (typeof value !== "string" || !HEX.test(value)) {
        throw new Error(`${path}: expected #rrggbb`);
    }
    return value.toLowerCase();
}

function optionalNumber(
    source: Record<string, unknown>,
    key: string,
    path: string
): number | undefined {
    if (!(key in source)) return undefined;
    return number(source, key, path);
}

function parseColors(value: unknown, path: string): StatBarColors {
    const raw = record(value, path);
    return {
        base: hexColor(raw.base, `${path}.base`),
        overlay: hexColor(raw.overlay, `${path}.overlay`),
        diff: hexColor(raw.diff, `${path}.diff`),
        flashBase: hexColor(raw.flash_base, `${path}.flash_base`),
        flashOverlay: hexColor(raw.flash_overlay, `${path}.flash_overlay`),
    };
}

function parseGradient(
    value: unknown,
    path: string
): StatBarGradientStop[] | undefined {
    if (value === undefined) return undefined;
    if (!Array.isArray(value) || value.length < 2) {
        throw new Error(`${path}: expected at least 2 stops`);
    }
    const stops = value.map((entry, index) => {
        const stopPath = `${path}[${index}]`;
        const raw = record(entry, stopPath);
        const at = number(raw, "at", stopPath);
        if (at < 0 || at > 1) {
            throw new Error(`${stopPath}.at: expected 0..1`);
        }
        return {
            at,
            base: hexColor(raw.base, `${stopPath}.base`),
            overlay: hexColor(raw.overlay, `${stopPath}.overlay`),
        };
    });
    for (let i = 1; i < stops.length; i++) {
        const prev = stops[i - 1];
        const curr = stops[i];
        if (!prev || !curr || curr.at < prev.at) {
            throw new Error(`${path}: stops must be sorted by at`);
        }
    }
    return stops;
}

function parseBar(value: unknown, path: string): StatBarConfig {
    const raw = record(value, path);
    const max = number(raw, "max", path);
    if (max <= 0) throw new Error(`${path}.max: must be > 0`);
    const shake = number(raw, "shake", path);
    if (shake < 0) throw new Error(`${path}.shake: expected >= 0`);
    const flashBelowRatio = optionalNumber(raw, "flash_below_ratio", path);
    if (
        flashBelowRatio !== undefined &&
        (flashBelowRatio < 0 || flashBelowRatio > 1)
    ) {
        throw new Error(`${path}.flash_below_ratio: expected 0..1`);
    }
    return {
        max,
        split: boolean(raw, "split", path),
        icon: string(raw, "icon", path),
        colors: parseColors(raw.colors, `${path}.colors`),
        shake,
        flashBelow: optionalNumber(raw, "flash_below", path),
        flashAbove: optionalNumber(raw, "flash_above", path),
        flashBelowRatio,
        gradient: parseGradient(raw.gradient, `${path}.gradient`),
    };
}

export function parseStatBarsConfig(value: unknown): StatBarsConfig {
    const root = record(value, "stat_bars");
    const config = {} as StatBarsConfig;
    for (const key of BAR_KEYS) {
        if (!(key in root)) {
            throw new Error(`stat_bars.${key}: missing bar`);
        }
        config[key] = parseBar(root[key], `stat_bars.${key}`);
    }
    return config;
}
