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

export type SurgeRetreat = {
    originX: number;
    originY: number;
    dirX: number;
    dirY: number;
    surgeDistance: number;
    age: number;
    lifetime: number;
};

/**
 * Snap a surge to its apex at the hit point, then retreat along `nx,ny`
 * (circle normal) back out — same wash-out curve, not an instant fade.
 */
export function surgeRetreatFromHit(
    hitX: number,
    hitY: number,
    nx: number,
    ny: number,
    along: number,
    surgeDistance: number,
    apexAt: number,
    lifetime: number
): SurgeRetreat {
    const retreatDist = Math.max(24, surgeDistance * Math.max(0.2, along));
    const apex = Math.min(0.95, Math.max(0.05, apexAt));
    const age = apex * lifetime;
    const retreatMs = (1 - apex) * lifetime;
    return {
        originX: hitX - nx * retreatDist,
        originY: hitY - ny * retreatDist,
        dirX: nx,
        dirY: ny,
        surgeDistance: retreatDist,
        age,
        lifetime: age + retreatMs,
    };
}
