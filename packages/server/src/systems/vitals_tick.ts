/** Per-player, per-stat accumulators for discrete vitals periods. */
const accumulatedMs = new Map<string, number>();

function key(playerId: number, channel: string): string {
    return `${playerId}:${channel}`;
}

/**
 * Advance one vitals channel by `deltaMs`.
 * Returns how many full `periodMs` intervals elapsed (apply the rate that many times).
 */
export function takeVitalsTicks(
    playerId: number,
    channel: string,
    deltaMs: number,
    periodMs: number
): number {
    const k = key(playerId, channel);
    let acc = (accumulatedMs.get(k) ?? 0) + deltaMs;
    let ticks = 0;
    while (acc >= periodMs) {
        acc -= periodMs;
        ticks++;
    }
    accumulatedMs.set(k, acc);
    return ticks;
}

export function clearVitalsTicks(playerId: number): void {
    const prefix = `${playerId}:`;
    for (const k of accumulatedMs.keys()) {
        if (k.startsWith(prefix)) accumulatedMs.delete(k);
    }
}
