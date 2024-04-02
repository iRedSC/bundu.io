export function isSubset<T>(subSet: Set<T>, superSet: Set<T>) {
    subSet.forEach((value) => {
        if (!superSet.has(value)) {
            return false;
        }
    });
    return true;
}

export function intersection<T>(
    subSet: Set<T>,
    superSet: Set<T>,
    getUnique: boolean = false
) {
    const intersection = new Set<T>();
    subSet.forEach((value) => {
        if (!getUnique && superSet.has(value)) {
            intersection.add(value);
        } else if (getUnique && !superSet.has(value)) {
            intersection.add(value);
        }
    });
    return intersection;
}
