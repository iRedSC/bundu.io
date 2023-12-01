export function randomInt(min: number, max: number): number {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function round(num: number, digits?: number) {
    if (!digits) {
        digits = 2;
    }
    const place = 10 ** digits;
    return Math.round((num + Number.EPSILON) * place) / place;
}

export function randomHexColor(): number {
    const letters = "0123456789ABCDEF";
    let color = 0x0;

    for (let i = 0; i < 6; i++) {
        color =
            (color << 4) |
            letters.indexOf(letters[Math.floor(Math.random() * 16)]);
    }

    return color;
}
