export const serverTime = {
    ping: 0,
    pingTimeStart: 0,

    targetOffset: 0,
    offset: 0,
    renderDelay: 500,
    synced: false,

    now() {
        return performance.now() + this.offset + this.ping - this.renderDelay;
    },

    /** Align to a server batch timestamp (ms since server start). */
    sync(serverTimestamp: number) {
        this.targetOffset = serverTimestamp - performance.now();
        if (!this.synced) {
            this.offset = this.targetOffset;
            this.synced = true;
        }
    },
};
