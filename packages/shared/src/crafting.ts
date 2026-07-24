/**
 * Crafting helpers for `crafting.multiplier` / `crafting.speed`.
 *
 * Both are direct multipliers (default 1):
 * - `2` → double cost / double speed
 * - `0.5` → half cost / half speed
 *
 * When the base ingredient amount is at least 2, the scaled amount cannot fall
 * below 2 (e.g. 4 wood at multiplier 0 → 2 wood). Base amounts below 2 are
 * unchanged by that floor.
 */

/**
 * Scale one ingredient amount by `crafting.multiplier`.
 * Rounds up so partial stacks never under-charge. Base amounts ≥ 2 floor at 2.
 */
export function scaleCraftAmount(amount: number, multiplier: number): number {
    if (amount <= 0) return 0;
    const scaled = amount * multiplier;
    const rounded = scaled <= 0 ? 0 : Math.ceil(scaled - Number.EPSILON);
    return amount >= 2 ? Math.max(2, rounded) : rounded;
}

/** Scale every ingredient entry; drops amounts that round to zero. */
export function scaleCraftIngredients(
    ingredients: Iterable<[number, number]>,
    multiplier: number
): Map<number, number> {
    const out = new Map<number, number>();
    for (const [itemId, amount] of ingredients) {
        const scaled = scaleCraftAmount(amount, multiplier);
        if (scaled > 0) out.set(itemId, scaled);
    }
    return out;
}

/**
 * Effective craft channel length for `crafting.speed`.
 * Higher speed shortens duration (`2` → half time). Non-positive speed yields
 * an effectively endless channel.
 */
export function craftDurationMs(baseDuration: number, speed: number): number {
    if (baseDuration <= 0) return 0;
    if (speed <= 0) return Number.MAX_SAFE_INTEGER;
    return baseDuration / speed;
}
