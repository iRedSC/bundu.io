export const serverTime = {
    start: 0,
    now() {
        return Date.now() - this.start - 100;
    },
};
