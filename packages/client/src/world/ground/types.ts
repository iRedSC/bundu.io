import type { Container, Rectangle } from "pixi.js";
import type { ParticleBurst } from "../../rendering/particles/types";

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
    /** Emit ambient foam / sparkles into the shared particle system. */
    emitParticles?: (burst: ParticleBurst) => void;
    /** Shore samples in world pixels (rebuilt when ground patches change). */
    shore: readonly ShoreSample[];
    /** True when the topmost ground at this world pixel is an ocean model. */
    isOceanAt: (worldX: number, worldY: number) => boolean;
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
    update?(ctx: GroundUpdateContext): void;
};

export type GroundModelDef = {
    id: string;
    /** Admin palette / ghost swatch + base fill. */
    color: string;
    create(bounds: Rectangle, zIndex: number): GroundVisual;
};
