/**
 * Organic edge noise shared by land / pond shaders (and any CPU fallback).
 * Keep coefficients in sync with the GLSL/WGSL ports in organic_*_filter.ts.
 */

/** How far the organic land edge can push past the authored rect (tiles). */
export const LAND_SEAM_AMPLITUDE = 1.15;
/** Pond edge: slightly calmer than land↔land. */
export const POND_SEAM_AMPLITUDE = LAND_SEAM_AMPLITUDE * 0.88;

export function seamOffset(px: number, py: number): number {
    const wx =
        px +
        0.9 * Math.sin(0.45 * py + 0.2 * px + 0.6) +
        0.5 * Math.sin(1.0 * px - 0.62 * py + 2.1) +
        0.22 * Math.sin(1.7 * py + 0.85 * px + 3.4);
    const wy =
        py +
        0.9 * Math.sin(0.4 * px - 0.26 * py + 1.9) +
        0.5 * Math.sin(0.92 * py + 0.68 * px + 0.4) +
        0.22 * Math.sin(1.55 * px - 1.1 * py + 5.0);
    return (
        LAND_SEAM_AMPLITUDE *
        (0.22 * Math.sin(1.6 * wx + 0.7 * wy) +
            0.17 * Math.sin(1.0 * wx - 1.4 * wy + 1.4) +
            0.14 * Math.sin(2.6 * wx + 1.2 * wy + 2.7) +
            0.12 * Math.sin(0.68 * (wx + wy) + 0.8) +
            0.1 * Math.sin(3.5 * wx - 2.1 * wy + 3.9) +
            0.08 * Math.sin(2.0 * (wx - wy) + 5.1) +
            0.07 * Math.sin(4.7 * wy + 1.15 * wx + 1.2) +
            0.05 * Math.sin(3.0 * wx + 3.3 * wy + 4.4) +
            0.03 * Math.sin(5.4 * (wx + 0.5 * wy) + 0.3) +
            0.02 * Math.sin(6.2 * wy - 3.8 * wx + 2.5))
    );
}

/**
 * Pond edge: mid-freq only — high-freq speckles spawn disconnected blobs.
 */
export function seamOffsetPond(px: number, py: number): number {
    const wx = px + 0.7 * Math.sin(0.38 * py + 0.22 * px + 0.4);
    const wy = py + 0.7 * Math.sin(0.34 * px - 0.28 * py + 1.3);
    return (
        POND_SEAM_AMPLITUDE *
        (0.32 * Math.sin(1.15 * wx + 0.6 * wy) +
            0.24 * Math.sin(0.82 * wx - 1.05 * wy + 1.5) +
            0.18 * Math.sin(1.55 * (wx + wy) + 2.3) +
            0.14 * Math.sin(0.55 * wx + 1.25 * wy + 0.9) +
            0.12 * Math.sin(2.05 * wx - 1.35 * wy + 3.1))
    );
}
