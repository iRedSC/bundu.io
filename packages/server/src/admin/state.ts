/** In-memory admin editor flags (session-scoped, not persisted). */
let animalsFrozen = false;

export function areAnimalsFrozen(): boolean {
    return animalsFrozen;
}

export function setAnimalsFrozen(frozen: boolean): void {
    animalsFrozen = frozen;
}
