export function round(num: number, digits: number = 0) {
    const place = 10 ** digits;
    return Math.round((num + Number.EPSILON) * place) / place;
}
