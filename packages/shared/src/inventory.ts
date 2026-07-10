/** How many items to place/drop from a stack. */
export const PlaceMode = {
    All: 0,
    Half: 1,
    One: 2,
} as const;

export type PlaceMode = (typeof PlaceMode)[keyof typeof PlaceMode];

export const MAX_STACK = 999;

export function amountForMode(count: number, mode: PlaceMode): number {
    if (count <= 0) return 0;
    if (mode === PlaceMode.One) return 1;
    if (mode === PlaceMode.Half) return Math.max(1, Math.ceil(count / 2));
    return count;
}

export function placeModeFromModifiers(
    shift: boolean,
    ctrl: boolean
): PlaceMode {
    if (ctrl) return PlaceMode.One;
    if (shift) return PlaceMode.Half;
    return PlaceMode.All;
}
