import type { Container, Texture } from "pixi.js";
import type { ContaineredSprite } from "../assets/sprite_factory";
import type { ParticleBurst } from "../rendering/particles/types";
import type { RotationStates, PositionStates } from "../world/states";

/** Pose on a part's root container (degrees for rotation). */
export type PartPose = {
    x?: number;
    y?: number;
    scale?: number;
    rotation?: number;
    zIndex?: number;
    pivot?: { x: number; y: number };
};

/** Pixi blend modes allowed on visual parts (subset of BLEND_MODES). */
export type PartBlendMode =
    | "normal"
    | "add"
    | "multiply"
    | "screen"
    | "divide"
    | "erase";

export type PartDef = PartPose & {
    name: string;
    /** Texture key; empty string = blank placeholder. */
    sprite?: string;
    /** Parent part name; omit to attach to object root. */
    parent?: string;
    anchor?: { x: number; y: number };
    /** ContaineredSprite.scale on the visual (not SpriteFactory normalize). */
    spriteScale?: number;
    /**
     * Extra pixels beyond the tile footprint this part's texture covers
     * (tile entities only). Does not expand other parts' canvas.
     */
    spillover?: number;
    /** Create a hidden attach child for equipment / overlays. */
    attach?: boolean;
    /** Draw attach above the visual (helmet); default is under (items under hands). */
    attachAbove?: boolean;
    /** Anchor for the attach child (e.g. offhand grip). */
    attachAnchor?: { x: number; y: number };
    alpha?: number;
    /** When false, visual starts hidden. */
    visible?: boolean;
    /** Compositing mode for this part's promoted root (e.g. divide vs sky multiply). */
    blendMode?: PartBlendMode;
    /**
     * Soft disc radius for the shared sky-undo bake (one divide pass).
     * Radius = 0.5 × spriteScale × structure world scale (no visible sprite).
     */
    skyUndo?: boolean;
};

export type VisualContent =
    | { texture: string; visual?: never }
    | { texture?: never; visual: string };

export type VisualContext = PartPose & VisualContent;

export type ContextualVisualDef = {
    id: string;
    abstract: boolean;
    contexts: Readonly<Record<string, VisualContext>>;
};

export type SlotDef = {
    part: string;
    context: string;
    /** Flip display x after apply (offhand). */
    mirrorX?: boolean;
    /** Scale applied to the attach node after SpriteFactory.update. */
    scale?: number;
};

export type AnimPreset =
    | "hurt"
    | "hit"
    | "place"
    | "wave"
    | "tree_sway"
    | "bob"
    | "lunge"
    | "attack"
    | "spike_attack"
    | "block"
    | "eat"
    | "rotting"
    | "fire_glow";

export type HitData = {
    /** Peak rotation kick in degrees. Default 14. */
    kick?: number;
    /** Animation duration in milliseconds. Default 450. */
    duration?: number;
};

export type TreeSwayData = {
    distance?: number;
    /** Maximum tilt in degrees. */
    tilt?: number;
    /** Cycle duration in milliseconds. */
    duration?: number;
    /** Millisecond phase offset applied successively to each listed part. */
    stagger?: number;
};

export type BobData = {
    /** Peak bob displacement in tile-root local units (1 = one tile at scale 1) before the 0.35 factor. */
    amplitude?: number;
};

type AnimData = {
    hurt: undefined;
    hit: HitData;
    place: undefined;
    wave: undefined;
    tree_sway: TreeSwayData;
    bob: BobData;
    lunge: undefined;
    attack: undefined;
    spike_attack: undefined;
    block: undefined;
    eat: undefined;
    rotting: undefined;
    fire_glow: undefined;
};

type AnimDefBase = {
    /** Part names the preset targets. */
    parts: string[];
    autoplay?: boolean;
};

export type AnimDef = {
    [Preset in AnimPreset]: AnimDefBase & {
        preset: Preset;
        data?: AnimData[Preset];
    };
}[AnimPreset];

/** Client-local fade when the local player stands under this object. */
export type OcclusionDef = {
    /** Entity state toggled true/false by the occlusion driver. */
    state: string;
    /** World radius in tiles from the object origin. */
    radius: number;
};

export type ObjectDef = {
    id: string;
    abstract: boolean;
    parts: PartDef[];
    defaultVariant?: string;
    /** Variant id -> part name -> replacement texture key. */
    variants?: Record<string, Record<string, string>>;
    slots?: Record<string, SlotDef>;
    animations: Readonly<Record<string, AnimDef>>;
    states: Readonly<Record<string, StateDef>>;
    stateOrder: readonly string[];
    /**
     * Fade part alpha overrides over this many ms after the first resolve.
     * Used by occlusion and any other state-driven alpha changes.
     */
    alphaFadeMs?: number;
    occlusion?: OcclusionDef;
};

export type StateValue = boolean | number | string;

export type PartOverride = PartPose & {
    alpha?: number;
    visible?: boolean;
    /** 1 = unchanged, 0 = fully desaturated. */
    saturation?: number;
    filters?: string[];
};

export type StateOverride = {
    parts?: Record<string, PartOverride>;
    animations?: string[];
};

export type StateDef = {
    default: StateValue;
    values: Record<string, StateOverride>;
};

export type TileGeometry = {
    /** Authored sprite dimensions in pixels. */
    size: { width: number; height: number };
    /** Origin tile within the sprite's non-spillover bounds. */
    origin: { x: number; y: number };
    /** Decorative pixels outside every edge of the tile grid. */
    spillover: number;
    /** Occupied local tile offsets relative to origin. */
    footprint: readonly { x: number; y: number }[];
};

export type TileEntityDef = ObjectDef & {
    tile: TileGeometry;
    variants: Record<string, Record<string, string>>;
};

export type PartNode = {
    /** Authored layout and parentage; persistent state and animation never mutate it. */
    root: Container;
    /** Persistent transforms resolved from active entity states (pose, alpha, filters, saturation). */
    state: Container;
    /** Transient motion + authored pivot (presets rotate/translate around this). */
    animation: Container;
    visual: ContaineredSprite;
    attach?: Container;
    attachAnchor?: { x: number; y: number };
};

export type VisualDef = ObjectDef | TileEntityDef | ContextualVisualDef;

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
    position: { x: number; y: number; set(x: number, y: number): void };
    positionStates: PositionStates;
};

export const EMPTY_ANIM_CONTEXT: AnimContext = {
    blocking: false,
    eating: false,
    mainhand: "",
    offhand: "",
};
