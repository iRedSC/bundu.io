/**
 * Pack-authored client ground visuals (`assets/<ns>/ground_models/*.yml`).
 * Not entity ModelDefs — ground is AABB stacked fills + optional FX.
 */

export type GroundModelKind = "solid" | "ocean";

export type OceanGroundTextures = {
    caustics: string;
    displace: string;
    rippleIdle: string;
    rippleMove: string;
    foam: string;
    sparkle: string;
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
};

export type OceanGroundModelDef = {
    id: string;
    kind: "ocean";
    color: string;
    textures: OceanGroundTextures;
};

export type GroundModelDef = SolidGroundModelDef | OceanGroundModelDef;

export type GroundModelSet = Readonly<Record<string, GroundModelDef>>;

const HEX = /^#[0-9a-fA-F]{6}$/;

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
        const fill = parseSolidFill(raw.fill, `${path}.fill`);
        return fill
            ? { id, kind, color: color(raw.color, `${path}.color`), fill }
            : { id, kind, color: color(raw.color, `${path}.color`) };
    }
    if (kind === "ocean") {
        return {
            id,
            kind,
            color: color(raw.color, `${path}.color`),
            textures: parseOceanTextures(raw.textures, `${path}.textures`),
        };
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

export function parseHexColor(hex: string): number {
    return Number.parseInt(hex.replace("#", ""), 16);
}
