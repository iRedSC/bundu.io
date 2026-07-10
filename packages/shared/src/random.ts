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
    return arr[integer(0, arr.length - 1)] as T;
}

export const random = {
    integer,
    choice,
};
