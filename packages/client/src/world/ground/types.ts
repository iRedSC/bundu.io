import type { OceanGroundTextures } from "@bundu/shared/ground_models";
import type { Container, Rectangle, Renderer, Texture } from "pixi.js";
import type { ParticleBurst } from "../../rendering/particles/types";
import type { LandSeamChunkBake } from "./land_seam";

/** World-space view used to keep expensive FX viewport-scoped. */
export type GroundViewBounds = {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
};

export type GroundUpdateContext = {
    deltaMS: number;
    now: number;
    view: GroundViewBounds;
    /** Pixi renderer — ocean wakes bake a faded displace map each frame. */
    renderer: Renderer;
    /** Emit ambient foam / sparkles into the shared particle system. */
    emitParticles?: (burst: ParticleBurst) => void;
    /** Shore samples in world pixels (rebuilt when ground patches change). */
    shore: readonly ShoreSample[];
    /** True when the topmost ground at this world pixel is an ocean model. */
    isOceanAt: (worldX: number, worldY: number) => boolean;
    /**
     * Tiles from nearest land (`0` on land). Built with shores on patch change;
     * O(1) lookup. Capped at 255.
     */
    landDistanceAt: (worldX: number, worldY: number) => number;
    /** Opaque world-tile ocean→land color bake. */
    shoreColor: Texture;
    /** Independent land-side fade used only to mask ocean effects. */
    shoreMask: Texture;
};

/** Outward-facing shore sample along a land↔ocean boundary. */
export type ShoreSample = {
    x: number;
    y: number;
    /** Outward normal (toward ocean), unit-ish. */
    nx: number;
    ny: number;
};

/**
 * Client ground visual — not an entity `ModelDef`.
 * Ground is AABB stacked fills, so visuals are rect-bound + optional tick FX.
 */
export type GroundVisual = {
    container: Container;
    /** Optional independently sorted layer (frontmost ocean refraction). */
    overlay?: Container;
    update?(ctx: GroundUpdateContext): void;
    /** Append one edge-band seam chunk (solid land only). */
    applyLandSeam?(chunk: LandSeamChunkBake): void;
    /** Drop seam overlays before textures are destroyed. */
    clearLandSeam?(): void;
    /** Wake ripple at world position (ocean only). */
    addWakeRipple?(
        worldX: number,
        worldY: number,
        now: number,
        kind?: "idle" | "move"
    ): void;
    /** Moving signed displacement sprites for clear, refractive splashes. */
    addSplashDisplacement?(
        worldX: number,
        worldY: number,
        now: number,
        direction: number,
        speed: number
    ): void;
};

type GroundModelBase = {
    id: string;
    /** Admin palette / ghost swatch + base fill. */
    color: string;
    create(bounds: Rectangle, zIndex: number): GroundVisual;
};

export type SolidGroundModelDef = GroundModelBase & {
    kind: "solid";
};

export type OceanGroundModelRuntime = GroundModelBase & {
    kind: "ocean";
    textures: OceanGroundTextures;
    /** Opaque fill under land (shared shore color bake). */
    createFill(bounds: Rectangle, zIndex: number): GroundVisual;
};

export type GroundModelDef = SolidGroundModelDef | OceanGroundModelRuntime;
