/** HitEvent.flash — maps to client hurt tint colors. */
export const HitFlash = {
    Combat: 0,
    Heal: 1,
    Freeze: 2,
    Drown: 3,
    Starve: 4,
    Dehydrate: 5,
    Overheat: 6,
} as const;

export type HitFlash = (typeof HitFlash)[keyof typeof HitFlash];

const COLORS: Record<HitFlash, number> = {
    [HitFlash.Combat]: 0xff0000,
    [HitFlash.Heal]: 0x88fa57,
    [HitFlash.Freeze]: 0x4a90d9,
    [HitFlash.Drown]: 0xffffff,
    [HitFlash.Starve]: 0xb06b30,
    [HitFlash.Dehydrate]: 0x5dade2,
    [HitFlash.Overheat]: 0xff6600,
};

export function hitFlashColor(flash: number): number {
    return COLORS[flash as HitFlash] ?? COLORS[HitFlash.Combat];
}
