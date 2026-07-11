export const serverTime = {
    targetOffset: 0,
    offset: 0,
    /** Render this far behind server time so the snapshot buffer can interpolate. */
    renderDelay: 100,
    synced: false,

    now() {
        return performance.now() + this.offset - this.renderDelay;
    },

    /** Align to a server batch timestamp (ms since server start). */
    sync(serverTimestamp: number) {
        this.targetOffset = serverTimestamp - performance.now();
        if (!this.synced) {
            this.offset = this.targetOffset;
            this.synced = true;
            return;
        }
        // Ease toward the latest sample so clock drift doesn't jump the world.
        this.offset += (this.targetOffset - this.offset) * 0.1;
    },
};
