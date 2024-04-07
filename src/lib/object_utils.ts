function mergeObj(...arr: object[]) {
    return arr.reduce((acc, val) => {
        return { ...acc, ...val };
    }, {});
}

export function mergeObjects<T extends object>(
    base: T | undefined,
    override: Partial<T> | undefined,
    fallback: T
): T {
    return mergeObj(fallback, base || {}, override || {}) as T;
}
