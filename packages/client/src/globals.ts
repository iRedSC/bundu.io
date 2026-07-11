import { SERVER_TICK_MS } from "@bundu/shared";

/**
 * Client timing for movement smoothing (Suroi-style).
 * `serverDt` is the measured gap between the last two inbound batches —
 * position/rotation lerps use that as their duration, so jitter stretches
 * the next tween instead of emptying a snapshot buffer.
 */
export const serverTime = {
    /** Milliseconds between the last two received server batches. */
    serverDt: SERVER_TICK_MS,
    lastUpdateAt: 0,

    now() {
        return performance.now();
    },

    /** Call once per inbound batch (before applying packets). */
    noteUpdate() {
        const now = performance.now();
        if (this.lastUpdateAt > 0) {
            // Floor at 1ms so a burst can't divide-by-zero the lerp.
            this.serverDt = Math.max(1, now - this.lastUpdateAt);
        }
        this.lastUpdateAt = now;
    },

    reset() {
        this.serverDt = SERVER_TICK_MS;
        this.lastUpdateAt = 0;
    },
};
