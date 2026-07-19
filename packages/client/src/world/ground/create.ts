import { Rectangle } from "pixi.js";
import { clientGroundType } from "../../configs/registries";
import { groundModel } from "./models";
import type { GroundVisual } from "./types";

/**
 * Floor for ground zIndex — stays below entities (0+) and admin grid (-1).
 * Stack order is entity id ascending (`GROUND_Z_BASE + id`); base is deep enough
 * that normal id growth never reaches the entity layer.
 */
export const GROUND_Z_BASE = -1_000_000_000;

/**
 * Ocean flat fill under land. Uses a fully opaque shoreColor bake (never fade
 * color alpha — that reintroduces the blue coastline fringe). Land stays
 * clear on the beach band so this fill + FX own the ocean↔land seam.
 */
export const GROUND_Z_OCEAN_FILL = GROUND_Z_BASE - 1;

/**
 * Ocean FX above land so the fading shore mask can wash caustics onto beaches.
 * Below admin grid (-1) and entities (0+).
 */
export const GROUND_Z_OCEAN = -10;

/** Build a ground visual from the type's ground model. */
export function createGround(
    type: number,
    x: number,
    y: number,
    w: number,
    h: number,
    zIndex = GROUND_Z_BASE
): GroundVisual {
    const model = groundModel(clientGroundType(type).model);
    return model.create(new Rectangle(x, y, w, h), zIndex);
}

/** Opaque ocean fill for one authored ocean rectangle. */
export function createOceanFillForType(
    type: number,
    x: number,
    y: number,
    w: number,
    h: number,
    zIndex = GROUND_Z_OCEAN_FILL
): GroundVisual {
    const model = groundModel(clientGroundType(type).model);
    if (model.kind !== "ocean") {
        throw new Error(
            `Ground type ${type} model "${model.id}" is not ocean`
        );
    }
    return model.createFill(new Rectangle(x, y, w, h), zIndex);
}
