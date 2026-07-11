import { type BasicPoint } from "./types";
import { moveInDirection } from "./transforms";

/**
 * Axis-aligned (to facing) attack rectangle as world-space corner points.
 * `direction` is radians; `origin` is the near-edge center (after start offset).
 */
export function attackBoxPoints(
    origin: BasicPoint,
    direction: number,
    length: number,
    width: number
): BasicPoint[] {
    const end = moveInDirection({ x: 0, y: 0 }, direction, length);
    const perpendicular = direction + Math.PI / 2;
    const half = width / 2;
    const p1 = moveInDirection({ x: 0, y: 0 }, perpendicular, half);
    const p2 = moveInDirection(end, perpendicular, half);
    const p3 = moveInDirection(end, perpendicular + Math.PI, half);
    const p4 = moveInDirection({ x: 0, y: 0 }, perpendicular + Math.PI, half);
    return [
        { x: origin.x + p4.x, y: origin.y + p4.y },
        { x: origin.x + p3.x, y: origin.y + p3.y },
        { x: origin.x + p2.x, y: origin.y + p2.y },
        { x: origin.x + p1.x, y: origin.y + p1.y },
    ];
}

/** Facing angle (radians) from sprite/server rotation convention (0° = up). */
export function attackFacingRadians(rotationRadians: number) {
    return rotationRadians + Math.PI / 2;
}
