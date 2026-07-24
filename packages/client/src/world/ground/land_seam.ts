/**
 * Shared organic-edge amplitudes and CPU samplers for pond masks.
 * Land borders are resolution-independent meshes in `land_border.ts`.
 */

/** How far an organic land edge can push past the authored rect (tiles). */
export const LAND_SEAM_AMPLITUDE = 1.15;

/**
 * Pond edge: a bit more chaotic than a soft ellipse, but mid-freq only —
 * high-freq speckles spawn disconnected blobs outside the authored rect.
 */
export const POND_SEAM_AMPLITUDE = LAND_SEAM_AMPLITUDE * 0.88;

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
