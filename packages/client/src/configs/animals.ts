import raw from "./animals.yml";

export type AnimalVisualConfig = { scale: number; bob: number };
const fallback: AnimalVisualConfig = { scale: 70, bob: 3 };
export const animalVisuals = new Map<string, AnimalVisualConfig>(
    Object.entries(raw as Record<string, Partial<AnimalVisualConfig>>).map(([id, config]) => [id, { ...fallback, ...config }])
);
export function animalVisual(id: string): AnimalVisualConfig {
    return animalVisuals.get(id) ?? fallback;
}
