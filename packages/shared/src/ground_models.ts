/**
 * Pack-authored client ground visuals (`assets/<ns>/ground_models/*.yml`).
 * Not entity ModelDefs — ground is AABB stacked fills + optional FX.
 */

export type GroundModelKind = "solid" | "ocean";

/** Scalar or `[min, max]` — same shape as particle burst ranges. */
export type GroundFxRange = number | readonly [min: number, max: number];

export type OceanGroundTextures = {
    caustics: string;
    displace: string;
    rippleIdle: string;
    rippleMove: string;
    foam: string;
    sparkle: string;
};

/** Optional per-model caustic tints; omit to use `gameplay.yml` → `ocean.caustics`. */
export type OceanCausticTint = {
    a: string;
    b: string;
};

/** Default ocean→land color blend distance (tiles into water). */
export const DEFAULT_OCEAN_FADE_TILES = 12;

/** Soften hard edges where distinct water types meet (tiles into each side). */
export const DEFAULT_WATER_WATER_FADE_TILES = 6;

/** Debris / dust kicked up while moving — tinted from the land color. */
export type GroundTrailDef = {
    /** World pixels between bursts. */
    spacing: number;
    amount: GroundFxRange;
    speed: GroundFxRange;
    lifetime: GroundFxRange;
    size: GroundFxRange;
    endSize: number;
    /** Radians of directional spread. */
    spread: number;
    friction: number;
    gravity: number;
    /** Random darken/lighten of the land color (0..1). */
    colorJitter: number;
};

export const GROUND_AMBIENT_PERIODS = [
    "morning",
    "day",
    "evening",
    "night",
] as const;
export type GroundAmbientPeriod = (typeof GROUND_AMBIENT_PERIODS)[number];

/**
 * Continuous biome ambience (dust, snow, steam, fireflies…).
 * Size/alpha ranges are sampled with the same `t` so bigger can mean fainter.
 */
export type GroundAmbientEmitterDef = {
    intervalMs: readonly [min: number, max: number];
    /** Omit = all periods. */
    periods?: readonly GroundAmbientPeriod[];
    count: GroundFxRange;
    size: GroundFxRange;
    /** Peak alpha; pair-sampled with `size` (author high→low for big=faint). */
    alpha: GroundFxRange;
    lifetime: GroundFxRange;
    speed: GroundFxRange;
    /** Radians; omit to use global wind heading. */
    direction?: number;
    spread: number;
    friction: number;
    gravity: number;
    /** Added on top of global wind.x. */
    gravityX: number;
    endSize: number;
    /** `#rrggbb`; omit = white. */
    tint?: string;
    blendMode: "normal" | "add" | "screen";
    alphaFadeIn: number;
    alphaHold: number;
    spin: GroundFxRange;
    zIndex?: number;
};

/** Procedural solid-land fills (client bakes; optional on solid models). */
export type SolidGroundFill = "sand_bands" | "forest_blobs" | "solid_blobs";

export type SolidGroundModelDef = {
    id: string;
    kind: "solid";
    /** `#rrggbb` admin swatch + fill. */
    color: string;
    /** Slight procedural texture; omit for flat tint. */
    fill?: SolidGroundFill;
    /** When true, movers with model `footsteps` leave prints on this surface. */
    footsteps?: boolean;
    trail?: GroundTrailDef;
    /** Named continuous emitters keyed for pack tuning (dust, snow, …). */
    ambient?: Readonly<Record<string, GroundAmbientEmitterDef>>;
};

export type OceanGroundModelDef = {
    id: string;
    kind: "ocean";
    color: string;
    /** Ocean→land color blend distance in tiles (into water). */
    fadeTiles: number;
    /** Visual water↔water transition distance. */
    transitionTiles: number;
    /** Organic visual shoreline profile; authored tiles remain authoritative. */
    edge?: "organic";
    /** Whether FX may fade across the shoreline onto land. */
    shoreOvershoot: boolean;
    /** Render above containing land (inland water). */
    surfaceLayer: boolean;
    displacement: {
        strength: number;
        scroll: number;
        worldScale: number;
    };
    /** Optional caustic layer tints; omit to use gameplay.yml. */
    causticTint?: OceanCausticTint;
    textures: OceanGroundTextures;
};

export type GroundModelDef = SolidGroundModelDef | OceanGroundModelDef;

export type GroundModelSet = Readonly<Record<string, GroundModelDef>>;

const HEX = /^#[0-9a-fA-F]{6}$/;

const DEFAULT_TRAIL: GroundTrailDef = {
    spacing: 14,
    amount: [2, 4],
    speed: [40, 110],
    lifetime: [280, 520],
    size: [3, 7],
    endSize: 1,
    spread: 1.1,
    friction: 3.5,
    gravity: 60,
    colorJitter: 0.18,
};

function record(value: unknown, path: string): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`${path}: expected an object`);
    }
    return value as Record<string, unknown>;
}

function string(value: unknown, path: string): string {
    if (typeof value !== "string" || !value) {
        throw new Error(`${path}: expected a non-empty string`);
    }
    return value;
}

function optionalBoolean(
    raw: Record<string, unknown>,
    snake: string,
    camel: string,
    path: string,
    fallback: boolean
): boolean {
    const value = raw[snake] ?? raw[camel];
    if (value === undefined) return fallback;
    if (typeof value !== "boolean") {
        throw new Error(`${path}.${snake}: expected a boolean`);
    }
    return value;
}

function color(value: unknown, path: string): string {
    const hex = string(value, path);
    if (!HEX.test(hex)) {
        throw new Error(`${path}: expected #rrggbb`);
    }
    return hex.toLowerCase();
}

function texturePath(value: unknown, path: string): string {
    return string(value, path);
}

function finiteNumber(value: unknown, path: string): number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`${path}: expected a finite number`);
    }
    return value;
}

function positiveNumber(value: unknown, path: string): number {
    const n = finiteNumber(value, path);
    if (n <= 0) throw new Error(`${path}: must be > 0`);
    return n;
}

function unitInterval(value: unknown, path: string): number {
    const n = finiteNumber(value, path);
    if (n < 0 || n > 1) throw new Error(`${path}: expected 0..1`);
    return n;
}

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

/** Like `fxRange`, but allows descending pairs (e.g. alpha big→faint). */
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

function optionalRange(
    raw: Record<string, unknown>,
    snake: string,
    camel: string,
    path: string,
    fallback: GroundFxRange
): GroundFxRange {
    const value = raw[snake] ?? raw[camel];
    return value === undefined ? fallback : fxRange(value, `${path}.${snake}`);
}

function optionalPositive(
    raw: Record<string, unknown>,
    snake: string,
    camel: string,
    path: string,
    fallback: number
): number {
    const value = raw[snake] ?? raw[camel];
    return value === undefined
        ? fallback
        : positiveNumber(value, `${path}.${snake}`);
}

function optionalUnit(
    raw: Record<string, unknown>,
    snake: string,
    camel: string,
    path: string,
    fallback: number
): number {
    const value = raw[snake] ?? raw[camel];
    return value === undefined
        ? fallback
        : unitInterval(value, `${path}.${snake}`);
}

function optionalFinite(
    raw: Record<string, unknown>,
    snake: string,
    camel: string,
    path: string,
    fallback: number
): number {
    const value = raw[snake] ?? raw[camel];
    return value === undefined
        ? fallback
        : finiteNumber(value, `${path}.${snake}`);
}

function optionalNonNegative(
    raw: Record<string, unknown>,
    snake: string,
    camel: string,
    path: string,
    fallback: number
): number {
    const value = raw[snake] ?? raw[camel];
    if (value === undefined) return fallback;
    const n = finiteNumber(value, `${path}.${snake}`);
    if (n < 0) throw new Error(`${path}.${snake}: expected >= 0`);
    return n;
}

function parseSolidFill(
    value: unknown,
    path: string
): SolidGroundFill | undefined {
    if (value === undefined) return undefined;
    const fill = string(value, path);
    if (
        fill === "sand_bands" ||
        fill === "forest_blobs" ||
        fill === "solid_blobs"
    ) {
        return fill;
    }
    throw new Error(
        `${path}: expected "sand_bands", "forest_blobs", or "solid_blobs"`
    );
}

function parseOceanTextures(
    value: unknown,
    path: string
): OceanGroundTextures {
    const raw = record(value, path);
    return {
        caustics: texturePath(raw.caustics, `${path}.caustics`),
        displace: texturePath(raw.displace, `${path}.displace`),
        rippleIdle: texturePath(
            raw.ripple_idle ?? raw.rippleIdle,
            `${path}.ripple_idle`
        ),
        rippleMove: texturePath(
            raw.ripple_move ?? raw.rippleMove,
            `${path}.ripple_move`
        ),
        foam: texturePath(raw.foam, `${path}.foam`),
        sparkle: texturePath(raw.sparkle, `${path}.sparkle`),
    };
}

function parseCausticTint(
    value: unknown,
    path: string
): OceanCausticTint {
    const raw = record(value, path);
    return {
        a: color(raw.a, `${path}.a`),
        b: color(raw.b, `${path}.b`),
    };
}

function parseFootstepsToggle(value: unknown, path: string): boolean {
    if (typeof value !== "boolean") {
        throw new Error(
            `${path}: expected true/false (footstep params live on actor models)`
        );
    }
    return value;
}

function parseTrail(value: unknown, path: string): GroundTrailDef {
    const raw = record(value, path);
    return {
        spacing: optionalPositive(
            raw,
            "spacing",
            "spacing",
            path,
            DEFAULT_TRAIL.spacing
        ),
        amount: optionalRange(
            raw,
            "amount",
            "amount",
            path,
            DEFAULT_TRAIL.amount
        ),
        speed: optionalRange(raw, "speed", "speed", path, DEFAULT_TRAIL.speed),
        lifetime: optionalRange(
            raw,
            "lifetime",
            "lifetime",
            path,
            DEFAULT_TRAIL.lifetime
        ),
        size: optionalRange(raw, "size", "size", path, DEFAULT_TRAIL.size),
        endSize: optionalPositive(
            raw,
            "end_size",
            "endSize",
            path,
            DEFAULT_TRAIL.endSize
        ),
        spread: optionalPositive(
            raw,
            "spread",
            "spread",
            path,
            DEFAULT_TRAIL.spread
        ),
        friction: optionalNonNegative(
            raw,
            "friction",
            "friction",
            path,
            DEFAULT_TRAIL.friction
        ),
        gravity: optionalFinite(
            raw,
            "gravity",
            "gravity",
            path,
            DEFAULT_TRAIL.gravity
        ),
        colorJitter: optionalUnit(
            raw,
            "color_jitter",
            "colorJitter",
            path,
            DEFAULT_TRAIL.colorJitter
        ),
    };
}

const DEFAULT_AMBIENT: GroundAmbientEmitterDef = {
    intervalMs: [400, 900],
    count: 1,
    size: [3, 10],
    alpha: [0.16, 0.04],
    lifetime: [1200, 2400],
    speed: [16, 48],
    spread: Math.PI * 2,
    friction: 0.35,
    gravity: 0,
    gravityX: 0,
    endSize: 0,
    blendMode: "normal",
    alphaFadeIn: 0.15,
    alphaHold: 0.55,
    spin: 0,
};

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

function parseAmbientPeriods(
    value: unknown,
    path: string
): readonly GroundAmbientPeriod[] | undefined {
    if (value === undefined) return undefined;
    if (!Array.isArray(value) || value.length === 0) {
        throw new Error(`${path}: expected a non-empty period list`);
    }
    const out: GroundAmbientPeriod[] = [];
    for (const [index, entry] of value.entries()) {
        if (
            typeof entry !== "string" ||
            !(GROUND_AMBIENT_PERIODS as readonly string[]).includes(entry)
        ) {
            throw new Error(
                `${path}[${index}]: expected one of ${GROUND_AMBIENT_PERIODS.join(", ")}`
            );
        }
        out.push(entry as GroundAmbientPeriod);
    }
    return out;
}

function parseBlendMode(
    value: unknown,
    path: string
): GroundAmbientEmitterDef["blendMode"] {
    if (value === undefined) return DEFAULT_AMBIENT.blendMode;
    if (value === "normal" || value === "add" || value === "screen") return value;
    throw new Error(`${path}: expected "normal", "add", or "screen"`);
}

function parseAmbientEmitter(
    value: unknown,
    path: string
): GroundAmbientEmitterDef {
    const raw = record(value, path);
    const alphaFadeIn = optionalUnit(
        raw,
        "alpha_fade_in",
        "alphaFadeIn",
        path,
        DEFAULT_AMBIENT.alphaFadeIn
    );
    const alphaHold = optionalUnit(
        raw,
        "alpha_hold",
        "alphaHold",
        path,
        DEFAULT_AMBIENT.alphaHold
    );
    if (alphaHold < alphaFadeIn) {
        throw new Error(`${path}.alpha_hold: must be >= alpha_fade_in`);
    }
    const tintRaw = raw.tint;
    const directionRaw = raw.direction;
    const zRaw = raw.z_index ?? raw.zIndex;
    const def: GroundAmbientEmitterDef = {
        intervalMs:
            raw.interval_ms !== undefined || raw.intervalMs !== undefined
                ? intervalMs(
                      raw.interval_ms ?? raw.intervalMs,
                      `${path}.interval_ms`
                  )
                : DEFAULT_AMBIENT.intervalMs,
        count: optionalRange(raw, "count", "count", path, DEFAULT_AMBIENT.count),
        size: optionalRange(raw, "size", "size", path, DEFAULT_AMBIENT.size),
        alpha: (() => {
            const value = raw.alpha;
            return value === undefined
                ? DEFAULT_AMBIENT.alpha
                : fxRangeOriented(value, `${path}.alpha`);
        })(),
        lifetime: optionalRange(
            raw,
            "lifetime",
            "lifetime",
            path,
            DEFAULT_AMBIENT.lifetime
        ),
        speed: optionalRange(raw, "speed", "speed", path, DEFAULT_AMBIENT.speed),
        spread: optionalPositive(
            raw,
            "spread",
            "spread",
            path,
            DEFAULT_AMBIENT.spread
        ),
        friction: optionalNonNegative(
            raw,
            "friction",
            "friction",
            path,
            DEFAULT_AMBIENT.friction
        ),
        gravity: optionalFinite(
            raw,
            "gravity",
            "gravity",
            path,
            DEFAULT_AMBIENT.gravity
        ),
        gravityX: optionalFinite(
            raw,
            "gravity_x",
            "gravityX",
            path,
            DEFAULT_AMBIENT.gravityX
        ),
        endSize: optionalNonNegative(
            raw,
            "end_size",
            "endSize",
            path,
            DEFAULT_AMBIENT.endSize
        ),
        blendMode: parseBlendMode(raw.blend_mode ?? raw.blendMode, `${path}.blend_mode`),
        alphaFadeIn,
        alphaHold,
        spin: optionalSignedRange(
            raw,
            "spin",
            "spin",
            path,
            DEFAULT_AMBIENT.spin
        ),
    };
    const periods = parseAmbientPeriods(raw.periods, `${path}.periods`);
    if (periods) def.periods = periods;
    if (tintRaw !== undefined) def.tint = color(tintRaw, `${path}.tint`);
    if (directionRaw !== undefined) {
        def.direction = finiteNumber(directionRaw, `${path}.direction`);
    }
    if (zRaw !== undefined) {
        def.zIndex = finiteNumber(zRaw, `${path}.z_index`);
    }
    return def;
}

function optionalSignedRange(
    raw: Record<string, unknown>,
    snake: string,
    camel: string,
    path: string,
    fallback: GroundFxRange
): GroundFxRange {
    const value = raw[snake] ?? raw[camel];
    if (value === undefined) return fallback;
    if (typeof value === "number") {
        if (!Number.isFinite(value)) {
            throw new Error(`${path}.${snake}: expected a finite number`);
        }
        return value;
    }
    if (!Array.isArray(value) || value.length !== 2) {
        throw new Error(`${path}.${snake}: expected a number or [min, max]`);
    }
    const [lo, hi] = value;
    if (
        typeof lo !== "number" ||
        typeof hi !== "number" ||
        !Number.isFinite(lo) ||
        !Number.isFinite(hi) ||
        hi < lo
    ) {
        throw new Error(`${path}.${snake}: expected min <= max`);
    }
    return [lo, hi];
}

function parseAmbientMap(
    value: unknown,
    path: string
): Readonly<Record<string, GroundAmbientEmitterDef>> {
    const raw = record(value, path);
    const out: Record<string, GroundAmbientEmitterDef> = {};
    for (const [name, entry] of Object.entries(raw)) {
        if (!name) throw new Error(`${path}: empty emitter name`);
        out[name] = parseAmbientEmitter(entry, `${path}.${name}`);
    }
    return out;
}

/** Parse one ground-model document. `fallbackId` is the file stem. */
export function parseGroundModelDef(
    value: unknown,
    fallbackId: string
): GroundModelDef {
    const path = `ground_model.${fallbackId}`;
    const raw = record(value, path);
    const id = raw.id !== undefined ? string(raw.id, `${path}.id`) : fallbackId;
    const kind = string(raw.kind, `${path}.kind`);
    if (kind === "solid") {
        const def: SolidGroundModelDef = {
            id,
            kind,
            color: color(raw.color, `${path}.color`),
        };
        const fill = parseSolidFill(raw.fill, `${path}.fill`);
        if (fill) def.fill = fill;
        if (raw.footsteps !== undefined) {
            def.footsteps = parseFootstepsToggle(
                raw.footsteps,
                `${path}.footsteps`
            );
        }
        if (raw.trail !== undefined) {
            def.trail = parseTrail(raw.trail, `${path}.trail`);
        }
        if (raw.ambient !== undefined) {
            def.ambient = parseAmbientMap(raw.ambient, `${path}.ambient`);
        }
        return def;
    }
    if (kind === "ocean") {
        if (
            raw.footsteps !== undefined ||
            raw.trail !== undefined ||
            raw.ambient !== undefined ||
            raw.fill !== undefined
        ) {
            throw new Error(
                `${path}: fill/footsteps/trail/ambient are only valid on solid ground models`
            );
        }
        const fadeTiles = optionalPositive(
            raw,
            "fade_tiles",
            "fadeTiles",
            path,
            DEFAULT_OCEAN_FADE_TILES
        );
        const tintRaw = raw.caustic_tint ?? raw.causticTint;
        const edgeRaw = raw.edge;
        if (edgeRaw !== undefined && edgeRaw !== "organic") {
            throw new Error(`${path}.edge: expected "organic"`);
        }
        const displacementRaw = record(
            raw.displacement ?? {},
            `${path}.displacement`
        );
        const def: OceanGroundModelDef = {
            id,
            kind,
            color: color(raw.color, `${path}.color`),
            fadeTiles,
            transitionTiles: optionalPositive(
                raw,
                "transition_tiles",
                "transitionTiles",
                path,
                DEFAULT_WATER_WATER_FADE_TILES
            ),
            shoreOvershoot: optionalBoolean(
                raw,
                "shore_overshoot",
                "shoreOvershoot",
                path,
                true
            ),
            surfaceLayer: optionalBoolean(
                raw,
                "surface_layer",
                "surfaceLayer",
                path,
                false
            ),
            displacement: {
                strength: optionalPositive(
                    displacementRaw,
                    "strength",
                    "strength",
                    `${path}.displacement`,
                    1
                ),
                scroll: optionalPositive(
                    displacementRaw,
                    "scroll",
                    "scroll",
                    `${path}.displacement`,
                    1
                ),
                worldScale: optionalPositive(
                    displacementRaw,
                    "world_scale",
                    "worldScale",
                    `${path}.displacement`,
                    1
                ),
            },
            textures: parseOceanTextures(raw.textures, `${path}.textures`),
        };
        if (edgeRaw === "organic") def.edge = edgeRaw;
        if (tintRaw !== undefined) {
            def.causticTint = parseCausticTint(tintRaw, `${path}.caustic_tint`);
        }
        return def;
    }
    throw new Error(`${path}.kind: expected "solid" or "ocean"`);
}

export function parseGroundModelSet(
    documents: Readonly<Record<string, unknown>>
): GroundModelSet {
    const out: Record<string, GroundModelDef> = {};
    for (const [fallbackId, document] of Object.entries(documents)) {
        const def = parseGroundModelDef(document, fallbackId);
        if (out[def.id]) {
            throw new Error(`Duplicate ground model id "${def.id}"`);
        }
        out[def.id] = def;
    }
    if (Object.keys(out).length === 0) {
        throw new Error("ground_models: expected at least one model");
    }
    return out;
}

export function isOceanGroundModel(def: GroundModelDef): def is OceanGroundModelDef {
    return def.kind === "ocean";
}

export function isSolidGroundModel(def: GroundModelDef): def is SolidGroundModelDef {
    return def.kind === "solid";
}

export function parseHexColor(hex: string): number {
    return Number.parseInt(hex.replace("#", ""), 16);
}

/** Randomly darken/lighten an `#rrggbb` / packed RGB by ±jitter. */
export function jitterLandColor(rgb: number, jitter: number): number {
    if (jitter <= 0) return rgb;
    const factor = 1 + (Math.random() * 2 - 1) * jitter;
    const channel = (shift: number) => {
        const value = ((rgb >> shift) & 0xff) * factor;
        return Math.max(0, Math.min(255, Math.round(value)));
    };
    return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}
