export const serverTime = {
    ping: 0,
    pingTimeStart: 0,

    targetOffset: 0,
    offset: 0,
    now() {
        return performance.now() + this.offset + this.ping - this.renderDelay;
    },
    renderDelay: 500,
};
