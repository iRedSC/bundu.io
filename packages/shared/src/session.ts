/** WebSocket close codes for hard session failure (client → menu, drop token). */
export const SESSION_ENDED_CLOSE = 4000;
export const SESSION_REJECTED_CLOSE = 4001;

/** Negative player ids returned by `createPlayer` when the join must be rejected. */
export const JOIN_RECLAIM_REJECTED = -1;

export function isHardSessionClose(code: number): boolean {
    return code === SESSION_ENDED_CLOSE || code === SESSION_REJECTED_CLOSE;
}
