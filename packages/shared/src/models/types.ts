/** Pose on a part's root container (degrees for rotation). */
export type PartPose = {
    x?: number;
    y?: number;
    scale?: number;
    rotation?: number;
    zIndex?: number;
    pivot?: { x: number; y: number };
};

/** Pixi blend modes allowed on model parts (subset of BLEND_MODES). */
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
     * Extra pixels of padding around logical content.
     * Actors: keeps content the same on-screen size as an unpadded texture.
     * Tile entities: overhang beyond the shared tile canvas (per-part override).
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
    /**
     * Drop-shadow height (positive number). Multiplies the day-cycle + light
     * offset vector (taller = longer cast in the same direction).
     * Omit / 0 = no shadow. Legacy `true` compiles as 1.
     */
    shadow?: number;
};

/**
 * Per-display pose + optional content override.
 * Omit texture/model to render the owning model's own content.
 */
export type ModelDisplay = PartPose & {
    texture?: string;
    /** Assemble another model's part graph (or use its texture). */
    model?: string;
};

export type SlotDef = {
    part: string;
    /** Display name to mount when this slot is filled (e.g. hand, body). */
    display: string;
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

/**
 * One model for every renderable: items, actors, tile entities.
 * Content is either a simple `texture`, an assembled `parts` graph, or both
 * (displays may override). Every consumer mounts via `displays`.
 */
export type ModelDef = {
    id: string;
    abstract: boolean;
    /** Default texture for simple (non-assembled) models and display inheritance. */
    texture?: string;
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
    /** Display transforms: inventory, icon, hand, body, world, … */
    displays: Readonly<Record<string, ModelDisplay>>;
    tile?: TileGeometry;
    /**
     * Actor footsteps when standing on land with `footsteps: true`.
     * `false` disables; `true` expands to defaults; object sets params + optional texture.
     */
    footsteps?: false | ModelFootstepsDef;
};

/** Actor footstep FX (surface only toggles whether these play). */
export type ModelFootstepsDef = {
    /** ms between prints while moving. */
    intervalMs: number;
    size: ModelFxRange;
    lifetime: ModelFxRange;
    /** Peak alpha while held (then fades to 0). */
    alpha: number;
    /** Lifetime progress [0,1] before the print starts fading. */
    fadeAt: number;
    /** Lateral offset from the path for left/right prints. */
    stride: number;
    /** Pack texture path. Omit for the default soft circle (dark tint). */
    texture?: string;
};

/** Scalar or `[min, max]` for model FX ranges. */
export type ModelFxRange = number | readonly [min: number, max: number];

/** Assembled model with a part graph (actors, structures). */
export type ObjectDef = ModelDef & {
    parts: PartDef[];
};

export type TileEntityDef = ObjectDef & {
    tile: TileGeometry;
    variants: Record<string, Record<string, string>>;
};

/** Wire format for server-sanitized, compiled model definitions. */
export type CompiledModelsPayload = {
    format: 2;
    defs: Record<string, ModelDef>;
};

export function modelHasParts(def: ModelDef): boolean {
    return def.parts.length > 0;
}

export function isTileModel(def: ModelDef): def is TileEntityDef {
    return def.tile !== undefined;
}
