import type {
    OceanGroundTextures,
    SolidGroundFill,
} from "@bundu/shared/ground_models";
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
    /** Sky day-cycle index: 0 morning … 3 night. */
    dayPeriod: number;
    view: GroundViewBounds;
    /** Pixi renderer — ocean wakes bake a faded displace map each frame. */
    renderer: Renderer;
    /** Emit ambient shore wash / sparkles into the shared particle system. */
    emitParticles?: (burst: ParticleBurst) => void;
    /** Shore samples in world pixels (rebuilt when ground patches change). */
    shore: readonly ShoreSample[];
    /** True when the topmost ground at this world pixel is an ocean model. */
    isOceanAt: (worldX: number, worldY: number) => boolean;
    /** Ocean-kind ground model id under a world pixel, if any. */
    waterModelAt?: (worldX: number, worldY: number) => string | undefined;
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
    /**
     * Ocean displace + shore-mask FX container. Underwater overlays (air ring)
     * parent here to share DisplacementFilter and the nearshore alpha mask.
     */
    fxLayer?: Container;
    /** Center-relative displacement layer for world-anchored overlays. */
    anchoredFxLayer?: Container;
    setFxAnchor?(worldX: number, worldY: number): void;
    update?(ctx: GroundUpdateContext): void;
    /**
     * Rebake textured inset fill (sand/forest) after shore distance rebuild.
     * Tile-space inland sampler — same contract as sand-band shading.
     */
    paintLandFill?(inlandAt: (tileX: number, tileY: number) => number): void;
    /** Append one edge-band seam chunk (solid land only). */
    applyLandSeam?(chunk: LandSeamChunkBake): void;
    /** Drop one streamed seam chunk before its texture is destroyed. */
    removeLandSeam?(key: string): void;
    /** Drop seam overlays before textures are destroyed. */
    clearLandSeam?(): void;
    /** Free GPU resources when the patch is unloaded. */
    destroy?(): void;
    /**
     * Ocean FX only — bind a per-model shore mask so distinct water types
     * (ocean vs pond) do not share caustics across each other's tiles.
     */
    setShoreMask?(texture: Texture): void;
    /** Water model ids rendered by this compatible shared FX pass. */
    setWaterModelIds?(modelIds: ReadonlySet<string>): void;
    /** Authored patches used to build an organic FX mask. */
    setWaterBounds?(bounds: readonly Rectangle[]): void;
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
        speed: number,
        /** Multiplies particle count (1 = default). */
        intensity?: number
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
    fill?: SolidGroundFill;
};

export type OceanGroundModelRuntime = GroundModelBase & {
    kind: "ocean";
    textures: OceanGroundTextures;
    /** Opaque fill under land (shared shore color bake). */
    createFill(bounds: Rectangle, zIndex: number): GroundVisual;
};

export type GroundModelDef = SolidGroundModelDef | OceanGroundModelRuntime;
