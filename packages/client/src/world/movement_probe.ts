/**
 * Lightweight counters for movement hitch diagnosis.
 * Always present (cheap); the debug HUD is what reads them.
 */
export const movementProbe = {
    /** performance.now() of last inbound batch. */
    lastBatchAt: 0,
    /** performance.now() of last SetPosition applied to the watched id. */
    lastPosAt: 0,
    /** SetPosition count for the watched id since beginFrame(). */
    posSetsThisFrame: 0,
    /** Distance old→target on the last SetPosition. */
    lastSpan: 0,
    /** Latest lerp factor [0,1] for the watched object. */
    lerpT: 0,
    /** True when past the target and no longer coasting (frozen). */
    held: false,
    /** True when coasting past the target at segment velocity. */
    extrapolating: false,
    /** serverDt captured at last SetPosition (lerp duration for that step). */
    serverDtAtSet: 0,
    watchedId: -1,

    beginFrame() {
        this.posSetsThisFrame = 0;
    },

    noteBatch(now: number) {
        this.lastBatchAt = now;
    },

    watch(id: number) {
        this.watchedId = id;
    },

    notePos(id: number, span: number, serverDt: number, now: number) {
        if (id !== this.watchedId) return;
        this.lastPosAt = now;
        this.lastSpan = span;
        this.serverDtAtSet = serverDt;
        this.posSetsThisFrame += 1;
    },

    noteLerp(id: number, t: number, extrapolating = false) {
        if (id !== this.watchedId) return;
        this.lerpT = t;
        this.extrapolating = extrapolating;
        // Frozen only after the extrapolate window ends (t stuck at 1, not coasting).
        this.held = t >= 1 && !extrapolating;
    },

    reset() {
        this.lastBatchAt = 0;
        this.lastPosAt = 0;
        this.posSetsThisFrame = 0;
        this.lastSpan = 0;
        this.lerpT = 0;
        this.held = false;
        this.extrapolating = false;
        this.serverDtAtSet = 0;
        this.watchedId = -1;
    },
};
