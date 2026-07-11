import type { Container } from "pixi.js";
import type { ContaineredSprite } from "../assets/sprite_factory";

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
    sprite: string;
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

export type AnimPreset = "hurt" | "hit" | "wave" | "attack" | "block";

export type AnimDef = {
    id: number;
    preset: AnimPreset;
    /** Part names the preset targets. */
    parts: string[];
    autoplay?: boolean;
};

export type ObjectDef = {
    id: string;
    parts: PartDef[];
    slots?: Record<string, SlotDef>;
    animations?: AnimDef[];
};

export type PartNode = {
    root: Container;
    visual: ContaineredSprite;
    attach?: ContaineredSprite;
};

/** Mutable state presets like attack/block read each frame. */
export type AnimContext = {
    blocking: boolean;
    mainhand: string;
    offhand: string;
};

/** GameObject-sized hit target (structure hurt punch). */
export type SizeTarget = { size: number };

export const EMPTY_ANIM_CONTEXT: AnimContext = {
    blocking: false,
    mainhand: "",
    offhand: "",
};
