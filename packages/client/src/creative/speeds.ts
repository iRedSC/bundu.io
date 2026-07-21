export const CREATIVE_SPEEDS = [0.5, 1, 2, 4] as const;
export type CreativeSpeed = (typeof CREATIVE_SPEEDS)[number];

export function cycleCreativeSpeed(current: CreativeSpeed): CreativeSpeed {
    const i = CREATIVE_SPEEDS.indexOf(current);
    return CREATIVE_SPEEDS[(i + 1) % CREATIVE_SPEEDS.length] ?? 1;
}

export function formatSpeedLabel(speed: CreativeSpeed): string {
    return `Speed ${speed}x`;
}
