export const serverTime = {
    start: performance.now(),
    now() {
        return performance.now() - this.start;
    },
};
