import type { Container, Texture } from "pixi.js";
import type { ContaineredSprite } from "../assets/sprite_factory";
import type { ParticleBurst } from "../rendering/particles/types";
import type { RotationStates, PositionStates } from "../world/states";

export type {
    AnimDef,
    AnimPreset,
    BobData,
    CompiledModelsPayload,
    HitData,
    ModelDef,
    ModelDisplay,
    ObjectDef,
    OcclusionDef,
    PartBlendMode,
    PartDef,
    PartOverride,
    PartPose,
    SlotDef,
    StateDef,
    StateOverride,
    StateValue,
    TileEntityDef,
    TileGeometry,
    TreeSwayData,
} from "@bundu/shared/models/types";

export { isTileModel, modelHasParts } from "@bundu/shared/models/types";

export type PartNode = {
    /** Authored layout and parentage; persistent state and animation never mutate it. */
    root: Container;
    /** Persistent transforms resolved from active entity states (pose, alpha, filters, saturation). */
    state: Container;
    /** Transient motion + authored pivot (presets rotate/translate around this). */
    animation: Container;
    visual: ContaineredSprite;
    /** Solid black under-sprite when PartDef.shadow is set. */
    shadow?: ContaineredSprite;
    attach?: Container;
    attachAnchor?: { x: number; y: number };
};

/** Mutable state presets like attack/block read each frame. */
export type AnimContext = {
    blocking: boolean;
    eating: boolean;
    mainhand: string;
    offhand: string;
    eatingDuration?: number;
    /** Optional particle emit for ambient presets (rotting crumble). */
    emitParticles?: (burst: ParticleBurst) => void;
    particleAnchor?: () => {
        texture: Texture;
        x: number;
        y: number;
        radius: number;
    };
};

/** GameObject-rotated hit target (structure hurt punch). */
export type Rotatable = { rotationStates: RotationStates; rotation: number };

/** Structure hit target with position for knockback. */
export type HitTarget = Rotatable & {
    position: { x: number; y: number; set(x: number; y: number): void };
    positionStates: PositionStates;
};

export const EMPTY_ANIM_CONTEXT: AnimContext = {
    blocking: false,
    eating: false,
    mainhand: "",
    offhand: "",
};
