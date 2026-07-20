import { TILE_SIZE } from "@bundu/shared/tiles";
import { isTileModel, type ModelDef } from "@bundu/shared/models/types";

export type ModelBounds = {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
};

const boundsById = new Map<string, ModelBounds>();
let padding = 0;

export function setModelBounds(defs: ReadonlyMap<string, ModelDef>): void {
    boundsById.clear();
    padding = 0;
    for (const [id, def] of defs) {
        if (!isTileModel(def) || def.abstract) continue;
        const { size, origin, spillover } = def.tile;
        const minX = -(origin.x * TILE_SIZE + TILE_SIZE / 2 + spillover);
        const minY = -(origin.y * TILE_SIZE + TILE_SIZE / 2 + spillover);
        const bounds = {
            minX,
            minY,
            maxX: minX + size.width,
            maxY: minY + size.height,
        };
        boundsById.set(id, bounds);
        padding = Math.max(
            padding,
            Math.abs(bounds.minX),
            Math.abs(bounds.minY),
            Math.abs(bounds.maxX),
            Math.abs(bounds.maxY)
        );
    }
}

function modelBounds(id: string): ModelBounds | undefined {
    return boundsById.get(id);
}

export function rotatedModelBounds(
    id: string,
    quarterTurns: number,
    scale = 1
): ModelBounds | undefined {
    const bounds = modelBounds(id);
    if (!bounds) return undefined;
    const turns = ((quarterTurns % 4) + 4) % 4;
    if (turns === 0) return scaleBounds(bounds, scale);
    if (turns === 1) {
        return scaleBounds(
            {
                minX: -bounds.maxY,
                minY: bounds.minX,
                maxX: -bounds.minY,
                maxY: bounds.maxX,
            },
            scale
        );
    }
    if (turns === 2) {
        return scaleBounds(
            {
                minX: -bounds.maxX,
                minY: -bounds.maxY,
                maxX: -bounds.minX,
                maxY: -bounds.minY,
            },
            scale
        );
    }
    return scaleBounds(
        {
            minX: bounds.minY,
            minY: -bounds.maxX,
            maxX: bounds.maxY,
            maxY: -bounds.minX,
        },
        scale
    );
}

export function modelBoundsPadding(): number {
    return padding;
}

function scaleBounds(bounds: ModelBounds, scale: number): ModelBounds {
    return {
        minX: bounds.minX * scale,
        minY: bounds.minY * scale,
        maxX: bounds.maxX * scale,
        maxY: bounds.maxY * scale,
    };
}
