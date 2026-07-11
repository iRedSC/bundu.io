/**
 * Client clock for interpolation timestamps.
 */
export const serverTime = {
    now() {
        return performance.now();
    },

    reset() {
        // Reserved for session teardown; clock is wall-time based.
    },
};
