export function mergeObjs(...arr: object[]) {
    return Object.assign({}, ...arr);
}

export function mergeObjects<T extends object>(
    base: Partial<T> | undefined,
    override: Partial<T> | undefined,
    fallback: T
): T {
    return mergeObjs(fallback, base || {}, override || {}) as T;
}
