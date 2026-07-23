/**
 * Wash in/out distance factor along a surge path.
 * `0` at birth, `1` at apex, `0` at death — eased with a half-sine.
 */
export function surgeAlong(progress: number, apexAt: number): number {
    const t = Math.min(1, Math.max(0, progress));
    const apex = Math.min(0.95, Math.max(0.05, apexAt));
    const phase =
        t <= apex
            ? (t / apex) * (Math.PI / 2)
            : Math.PI / 2 + ((t - apex) / (1 - apex)) * (Math.PI / 2);
    return Math.sin(phase);
}

/**
 * Ease-out travel 0→1 for post-hit seaward retreat (no apex stall).
 */
export function surgeRetreatTravel(progress: number): number {
    const t = Math.min(1, Math.max(0, progress));
    return 1 - (1 - t) * (1 - t);
}

export type SurgeRetreat = {
    originX: number;
    originY: number;
    dirX: number;
    dirY: number;
    surgeDistance: number;
    lifetime: number;
};

/**
 * Build a seaward retreat from a circle hit.
 * `offshoreX/Y` is the unit wash reverse (back out to sea); the contact
 * normal is flipped/biased so motion always leaves toward open water.
 */
export function surgeRetreatFromHit(
    hitX: number,
    hitY: number,
    hitNx: number,
    hitNy: number,
    along: number,
    surgeDistance: number,
    apexAt: number,
    lifetime: number,
    offshoreX: number,
    offshoreY: number
): SurgeRetreat {
    let nx = hitNx;
    let ny = hitNy;
    if (nx * nx + ny * ny < 0.25) {
        nx = offshoreX;
        ny = offshoreY;
    }
    // Face seaward if the contact normal points inland.
    if (nx * offshoreX + ny * offshoreY < 0) {
        nx = -nx;
        ny = -ny;
    }
    // Bias toward offshore so sideways hits still wash out.
    nx += offshoreX;
    ny += offshoreY;
    const len = Math.hypot(nx, ny) || 1;
    nx /= len;
    ny /= len;

    const retreatDist = Math.max(
        120,
        surgeDistance * Math.max(0.4, along)
    );
    const apex = Math.min(0.95, Math.max(0.05, apexAt));
    const retreatMs = Math.max(1400, (1 - apex) * lifetime);

    return {
        originX: hitX,
        originY: hitY,
        dirX: nx,
        dirY: ny,
        surgeDistance: retreatDist,
        lifetime: retreatMs,
    };
}
