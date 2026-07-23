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
