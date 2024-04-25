/**
 * @returns random hex color
 */
function hexColor(): number {
    const letters: string = "0123456789ABCDEF";
    let color = 0x0;

    for (let i = 0; i < 6; i++) {
        color =
            (color << 4) |
            letters.indexOf(letters[Math.floor(Math.random() * 16)]);
    }

    return color;
}

/**
 *
 * @param min
 * @param max
 * @returns random integer between min and max (inclusive)
 */
export function integer(min: number, max: number): number {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Get random item out of an array
 * @param arr target array
 * @returns random element of array
 */
export function choice<T>(arr: T[]): T {
    return arr[integer(0, arr.length - 1)];
}

export default {
    hexColor,
    integer,
    choice,
};
