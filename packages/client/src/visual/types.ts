import type { Container } from "pixi.js";
import type { ContaineredSprite } from "../assets/sprite_factory";
import type { RotationStates } from "../world/states";

/** Pose on a part's root container (degrees for rotation). */
export type PartPose = {
    x?: number;
    y?: number;
    scale?: number;
    rotation?: number;
    zIndex?: number;
    pivot?: { x: number; y: number };
};

export type PartDef = PartPose & {
    name: string;
    /** Texture key; empty string = blank placeholder. */
    sprite?: string;
    /** Parent part name; omit to attach to object root. */
    parent?: string;
    anchor?: { x: number; y: number };
    /** ContaineredSprite.scale on the visual (not SpriteFactory normalize). */
    spriteScale?: number;
    /** Create a hidden attach child for equipment / overlays. */
    attach?: boolean;
    /** Draw attach above the visual (helmet); default is under (items under hands). */
    attachAbove?: boolean;
    /** Anchor for the attach child (e.g. offhand grip). */
    attachAnchor?: { x: number; y: number };
    alpha?: number;
    /** When false, visual starts hidden. */
    visible?: boolean;
};

export type SlotDisplay = "hand_display" | "body_display" | "world_display";

export type SlotDef = {
    part: string;
    display: SlotDisplay;
    /** Flip display x after apply (offhand). */
    mirrorX?: boolean;
    /** Scale applied to the attach node after SpriteFactory.update. */
    scale?: number;
};

export type AnimPreset =
    | "hurt"
    | "hit"
    | "wave"
    | "tree_sway"
    | "attack"
    | "block"
    | "rotting";

export type TreeSwayData = {
    distance?: number;
    /** Maximum tilt in degrees. */
    tilt?: number;
    /** Cycle duration in milliseconds. */
    duration?: number;
    /** Millisecond phase offset applied successively to each listed part. */
    stagger?: number;
};

type AnimData = {
    hurt: undefined;
    hit: undefined;
    wave: undefined;
    tree_sway: TreeSwayData;
    attack: undefined;
    block: undefined;
    rotting: undefined;
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
};

export type StateValue = boolean | number | string;

export type PartOverride = PartPose & {
    alpha?: number;
    visible?: boolean;
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

type TileEntityBase = Omit<ObjectDef, "variants"> & {
    tile: TileGeometry;
};

export type StructuredTileEntityDef = TileEntityBase & {
    variantSource: "structured";
    variants: Record<string, Record<string, string>>;
};

export type TextureTileEntityDef = TileEntityBase & {
    variantSource: "texture";
    /** Part whose sprite is the decoded texture variant. */
    texturePart: string;
    variants?: never;
};

export type TileEntityDef =
    | StructuredTileEntityDef
    | TextureTileEntityDef;

export type PartNode = {
    /** Authored layout and parentage; persistent state and animation never mutate it. */
    root: Container;
    /** Persistent transforms resolved from active entity states (pose, alpha, filters). */
    state: Container;
    /** Transient motion + authored pivot (presets rotate/translate around this). */
    animation: Container;
    visual: ContaineredSprite;
    attach?: ContaineredSprite;
};

/** Mutable state presets like attack/block read each frame. */
export type AnimContext = {
    blocking: boolean;
    mainhand: string;
    offhand: string;
};

/** GameObject-rotated hit target (structure hurt punch). */
export type Rotatable = { rotationStates: RotationStates, rotation: number };

export const EMPTY_ANIM_CONTEXT: AnimContext = {
    blocking: false,
    mainhand: "",
    offhand: "",
};
