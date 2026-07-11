/**
 * Client wall clock — test seam for interpolation.
 */
export const serverTime = {
    now() {
        return performance.now();
    },
};
