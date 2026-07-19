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
 * Ocean draws above all land so an SDF alpha mask can fade the whole ocean
 * (fill + caustics) over beaches. Below admin grid (-1) and entities (0+).
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
