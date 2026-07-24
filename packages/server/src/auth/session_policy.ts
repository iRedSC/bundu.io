const DEFAULT_PARKED_PLAYER_TTL_MS = 30_000;
const MIN_PARKED_PLAYER_TTL_MS = 1_000;
const MAX_PARKED_PLAYER_TTL_MS = 10 * 60_000;

export function parkedPlayerTtlMs(raw = process.env.PARKED_PLAYER_TTL_MS): number {
    const value = Number(raw ?? DEFAULT_PARKED_PLAYER_TTL_MS);
    if (!Number.isSafeInteger(value)) return DEFAULT_PARKED_PLAYER_TTL_MS;
    return Math.min(
        MAX_PARKED_PLAYER_TTL_MS,
        Math.max(MIN_PARKED_PLAYER_TTL_MS, value)
    );
}

export function rotateReconnectCredential(): string {
    return crypto.randomUUID();
}

export function reconnectCredentialMatches(
    stored: string | undefined,
    presented: string
): boolean {
    return stored !== undefined && stored === presented;
}

export function parkedPlayerExpired(
    parkedAt: number | undefined,
    now: number,
    ttlMs = parkedPlayerTtlMs()
): boolean {
    return parkedAt !== undefined && now - parkedAt >= ttlMs;
}
