/**
 * Lifetime size curve: `start` → optional `peak` → `end`.
 * `progress`, `peakAt`, and `endAt` are in [0, 1] of particle life.
 */
export function sizeEnvelope(
    progress: number,
    start: number,
    end: number,
    peak?: number,
    peakAt = 0.35,
    endAt = 1
): number {
    const t = Math.min(1, Math.max(0, progress));
    const endT = Math.min(1, Math.max(0, endAt));

    if (peak === undefined) {
        if (endT <= 0) return end;
        return start + (end - start) * Math.min(1, t / endT);
    }

    const peakT = Math.min(endT, Math.max(0, peakAt));
    if (t <= peakT) {
        if (peakT <= 0) return peak;
        return start + (peak - start) * (t / peakT);
    }
    if (t >= endT || endT <= peakT) return end;
    return peak + (end - peak) * ((t - peakT) / (endT - peakT));
}
