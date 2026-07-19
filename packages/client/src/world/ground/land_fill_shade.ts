import type { SolidGroundFill } from "@bundu/shared/ground_models";

/**
 * Opaque procedural shades of an authored land color.
 * Shared by seam bake (organic edge) and solid inset fill.
 */

/** Tiles inland before land fills reach full strength at the ocean edge. */
const LAND_OCEAN_FADE_TILES = 2.25;

/** Shade land RGB for a fill model; flat color when fill is absent. */
export function shadeLandFill(
    r: number,
    g: number,
    b: number,
    fill: SolidGroundFill | undefined,
    px: number,
    py: number,
    shoreDist: number
): [number, number, number] {
    if (!fill) return [r, g, b];
    let shaded: [number, number, number];
    if (fill === "forest_blobs") shaded = shadeForestBlobs(r, g, b, px, py);
    else if (fill === "solid_blobs") shaded = shadeSolidBlobs(r, g, b, px, py);
    else if (fill === "sand_bands")
        shaded = shadeSandBands(r, g, b, px, py, shoreDist);
    else return [r, g, b];
    return fadeToBase(r, g, b, shaded, shoreDist);
}

/** Lerp fill shade → flat land color near the ocean. */
function fadeToBase(
    r: number,
    g: number,
    b: number,
    shaded: [number, number, number],
    shoreDist: number
): [number, number, number] {
    const fade = oceanEdgeFade(shoreDist, LAND_OCEAN_FADE_TILES);
    if (fade >= 1) return shaded;
    if (fade <= 0) return [r, g, b];
    return [
        (r + (shaded[0] - r) * fade + 0.5) | 0,
        (g + (shaded[1] - g) * fade + 0.5) | 0,
        (b + (shaded[2] - b) * fade + 0.5) | 0,
    ];
}

/**
 * Dirty sine sand striations oriented by ocean distance.
 * Opaque shades of the authored land color only — fades to flat at the shore.
 */
export function shadeSandBands(
    r: number,
    g: number,
    b: number,
    px: number,
    py: number,
    shoreDist: number
): [number, number, number] {
    const warp =
        0.85 * Math.sin(0.29 * px + 0.19 * py + 0.8) +
        0.45 * Math.sin(0.62 * py - 0.38 * px + 2.3) +
        0.28 * Math.sin(1.15 * px + 0.72 * py + 4.0) +
        0.14 * Math.sin(1.9 * py - 1.1 * px + 1.4);
    const d = shoreDist + warp;
    const bands =
        Math.sin(1.05 * d + 0.35) +
        0.55 * Math.sin(2.15 * d + 0.18 * px + 1.5) +
        0.32 * Math.sin(0.48 * d - 0.22 * py + 2.9) +
        0.18 * Math.sin(3.2 * d + 0.9 * py + 0.55) +
        0.1 * Math.sin(4.6 * d - 0.4 * px + 3.7);
    const lumScale = 1 + bands * 0.42 * 0.07;
    // One field → light/dark chroma regions nest or sit apart, never cross.
    const cn = valueNoise(px * 0.11 + 12, py * 0.11 + 7);
    const { light, dark } = fieldBlobPair(cn);
    const chroma = light * 0.55 - dark * 0.45;
    return applyLandShade(r, g, b, lumScale, chroma * 0.55);
}

/**
 * Forest: soft noise + soft blobs (one field) + hard chips (separate field).
 * Soft↔hard may cross; within each field, borders nest or sit apart.
 */
export function shadeForestBlobs(
    r: number,
    g: number,
    b: number,
    px: number,
    py: number
): [number, number, number] {
    const soft =
        fbm(px * 0.2, py * 0.2, 4) * 0.65 +
        fbm(px * 0.45 + 17, py * 0.45 + 17, 3) * 0.35;

    const bx = px + fbm(px * 0.04, py * 0.04, 2) * 2.8;
    const by = py + fbm(px * 0.04 + 40, py * 0.04 + 40, 2) * 2.8;
    const softN = valueNoise(bx * 0.13, by * 0.13);
    const { light, dark } = fieldBlobPair(softN);
    const lumBlob = light * 0.14 - dark * 0.12;
    const chroma = (light - dark) * 0.5;

    // Independent hard field — may cross soft blob borders.
    const dx = px + fbm(px * 0.06 + 200, py * 0.06 + 200, 2) * 1.6;
    const dy = py + fbm(px * 0.06 + 230, py * 0.06 + 230, 2) * 1.6;
    const hardN = valueNoise(dx * 0.19 + 9, dy * 0.19 + 9);
    const darken = hardBlob(hardN) * 0.045;

    return applyLandShade(
        r,
        g,
        b,
        1 + soft * 0.07 + lumBlob - darken,
        chroma * 0.6
    );
}

/**
 * Mountain: hard chips from one noise field (iso-contours).
 * Nested or separate only — borders never cross.
 */
export function shadeSolidBlobs(
    r: number,
    g: number,
    b: number,
    px: number,
    py: number
): [number, number, number] {
    const dx = px + fbm(px * 0.06 + 200, py * 0.06 + 200, 2) * 1.6;
    const dy = py + fbm(px * 0.06 + 230, py * 0.06 + 230, 2) * 1.6;
    const n = valueNoise(dx * 0.28 + 9, dy * 0.28 + 9);
    let darken = 0;
    if (n >= 0.82) darken = 0.07;
    else if (n >= 0.72) darken = 0.045;
    return applyLandShade(r, g, b, 1 - darken, 0);
}

/**
 * Soft light (high) / dark (low) weights from one scalar field.
 * Complementary thresholds → regions nest or sit apart, borders never cross.
 */
function fieldBlobPair(n: number): { light: number; dark: number } {
    return { light: sharpBlob(n), dark: sharpBlob(1 - n) };
}

/** Opaque shade of the base land color (luminance + subtle chroma). */
function applyLandShade(
    r: number,
    g: number,
    b: number,
    lumScale: number,
    chroma: number
): [number, number, number] {
    let nr = r * lumScale;
    let ng = g * lumScale;
    let nb = b * lumScale;

    const lum = 0.2126 * nr + 0.7152 * ng + 0.0722 * nb;
    const sat = 1 + chroma * 0.14;
    nr = lum + (nr - lum) * sat;
    ng = lum + (ng - lum) * sat;
    nb = lum + (nb - lum) * sat;

    const twist = chroma * 0.045;
    return [
        clampByte(nr + twist * (ng - nb)),
        clampByte(ng + twist * (nb - nr)),
        clampByte(nb + twist * (nr - ng)),
    ];
}

function fbm(x: number, y: number, octaves: number): number {
    let sum = 0;
    let amp = 0.5;
    let freq = 1;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
        sum += amp * (valueNoise(x * freq, y * freq) * 2 - 1);
        norm += amp;
        amp *= 0.5;
        freq *= 2.03;
    }
    return norm > 0 ? sum / norm : 0;
}

function valueNoise(x: number, y: number): number {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const a = hash2(x0, y0);
    const b = hash2(x0 + 1, y0);
    const c = hash2(x0, y0 + 1);
    const d = hash2(x0 + 1, y0 + 1);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function hash2(ix: number, iy: number): number {
    let n = Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function sharpBlob(t: number): number {
    if (t <= 0.6) return 0;
    if (t >= 0.78) return 1;
    const u = (t - 0.6) / 0.18;
    return u * u * (3 - 2 * u);
}

function hardBlob(t: number): number {
    return t >= 0.72 ? 1 : 0;
}

/** Smooth 0→1 fade from ocean (shoreDist 0) over `tiles` inland. */
function oceanEdgeFade(shoreDist: number, tiles: number): number {
    if (tiles <= 0) return 1;
    if (shoreDist <= 0) return 0;
    if (shoreDist >= tiles) return 1;
    const u = shoreDist / tiles;
    return u * u * (3 - 2 * u);
}

function clampByte(v: number): number {
    return v <= 0 ? 0 : v >= 255 ? 255 : (v + 0.5) | 0;
}
