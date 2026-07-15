let serverOffset: number | undefined;

/** Single monotonic presentation clock and server-timestamp conversion seam. */
export const clientTime = {
    now() {
        return performance.now();
    },
    synchronize(serverNow: number) {
        serverOffset ??= this.now() - serverNow;
    },
    fromServer(serverTimestamp: number) {
        return serverTimestamp + (serverOffset ?? 0);
    },
    resetServerSync() {
        serverOffset = undefined;
    },
};

/** @deprecated Use `clientTime`; retained for compatibility with external tests. */
export const serverTime = clientTime;
