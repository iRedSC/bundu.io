/** Players who currently have animal freeze enabled (refcount via membership). */
const animalsFrozenBy = new Set<number>();

export function areAnimalsFrozen(): boolean {
    return animalsFrozenBy.size > 0;
}

export function setAnimalsFrozen(playerId: number, frozen: boolean): void {
    if (frozen) animalsFrozenBy.add(playerId);
    else animalsFrozenBy.delete(playerId);
}

/** Drop one admin's freeze vote (freecam exit / disconnect / kill). */
export function clearAnimalsFrozenFor(playerId: number): void {
    animalsFrozenBy.delete(playerId);
}
