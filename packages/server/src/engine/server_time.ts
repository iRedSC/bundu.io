/**
 * Monotonic clock for client sync packet headers only.
 * Gameplay timing (cooldowns, attack cadence, attribute expiry) uses `World.gameTime`.
 */
export const serverTime = {
    start: performance.now(),
    now() {
        return performance.now() - this.start;
    },
};
