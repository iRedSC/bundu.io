export { GROUND_Z_BASE, createGround } from "./create";
export {
    LAND_DISTANCE_MAX,
    LandDistanceField,
} from "./land_distance";
export { groundModel, isOceanGroundModel, listGroundModels } from "./models";
export { collectShoreSamples, type GroundPatchRef } from "./shore";
export type {
    GroundModelDef,
    GroundUpdateContext,
    GroundViewBounds,
    GroundVisual,
    ShoreSample,
} from "./types";
