export function round(num: number, digits?: number) {
    if (!digits) {
        digits = 2;
    }
    const place = 10 ** digits;
    return Math.round((num + Number.EPSILON) * place) / place;
}
