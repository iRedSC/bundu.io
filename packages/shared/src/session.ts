/** WebSocket close codes for hard session failure (client → menu, drop token). */
export const SESSION_ENDED_CLOSE = 4000;
export const SESSION_REJECTED_CLOSE = 4001;

export function isHardSessionClose(code: number): boolean {
    return code === SESSION_ENDED_CLOSE || code === SESSION_REJECTED_CLOSE;
}
