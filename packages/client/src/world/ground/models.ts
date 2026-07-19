import { oceanModel } from "./ocean";
import { solidModel } from "./solid";
import type { GroundModelDef } from "./types";

const MODELS: Record<string, GroundModelDef> = {
    ocean: oceanModel,
    grass: solidModel("grass", "#2a462b"),
    savannah: solidModel("savannah", "#b8954a"),
    island: solidModel("island", "#c9b07a"),
    mountain: solidModel("mountain", "#6a6e68"),
    snow: solidModel("snow", "#dfe8ed"),
};

const FALLBACK = solidModel("unknown", "#2a462b");

export function groundModel(id: string): GroundModelDef {
    return MODELS[id] ?? FALLBACK;
}

export function isOceanGroundModel(id: string): boolean {
    return id === "ocean";
}

export function listGroundModels(): readonly GroundModelDef[] {
    return Object.values(MODELS);
}
