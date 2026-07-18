import {
    OCCUPANCY_LAYERS_TOP_DOWN,
    type OccupancyLayer,
} from "@bundu/shared/occupancy_layer";
import { tileKey, type TilePos } from "@bundu/shared/tiles";

export type { OccupancyLayer };

type Cell = Partial<Record<OccupancyLayer, number>>;

/**
 * Layered tile occupancy: floor / structure / roof each hold at most one entity.
 * Structure layer covers walls, doors, resources, benches, fires, etc.
 */
export class OccupancyGrid {
    private readonly cells = new Map<number, Cell>();
    private readonly byEntity = new Map<
        number,
        { layer: OccupancyLayer; keys: number[] }
    >();

    get(x: number, y: number, layer: OccupancyLayer): number | undefined {
        return this.cells.get(tileKey(x, y))?.[layer];
    }

    /** Highest occupied layer on the tile, if any. */
    top(x: number, y: number): number | undefined {
        const cell = this.cells.get(tileKey(x, y));
        if (!cell) return undefined;
        for (const layer of OCCUPANCY_LAYERS_TOP_DOWN) {
            const id = cell[layer];
            if (id !== undefined) return id;
        }
        return undefined;
    }

    /** Every entity id present on the tile (any layer). */
    occupants(x: number, y: number): number[] {
        const cell = this.cells.get(tileKey(x, y));
        if (!cell) return [];
        const ids: number[] = [];
        for (const layer of OCCUPANCY_LAYERS_TOP_DOWN) {
            const id = cell[layer];
            if (id !== undefined) ids.push(id);
        }
        return ids;
    }

    layerOf(entityId: number): OccupancyLayer | undefined {
        return this.byEntity.get(entityId)?.layer;
    }

    canPlace(tiles: readonly TilePos[], layer: OccupancyLayer): boolean {
        for (const { x, y } of tiles) {
            if (this.cells.get(tileKey(x, y))?.[layer] !== undefined) {
                return false;
            }
        }
        return true;
    }

    /** Atomically replace an entity's prior claim when every tile slot is free. */
    occupy(
        entityId: number,
        tiles: readonly TilePos[],
        layer: OccupancyLayer
    ): boolean {
        for (const { x, y } of tiles) {
            const occupant = this.cells.get(tileKey(x, y))?.[layer];
            if (occupant !== undefined && occupant !== entityId) return false;
        }

        this.release(entityId);
        const keys: number[] = [];
        for (const { x, y } of tiles) {
            const key = tileKey(x, y);
            let cell = this.cells.get(key);
            if (!cell) {
                cell = {};
                this.cells.set(key, cell);
            }
            cell[layer] = entityId;
            keys.push(key);
        }
        this.byEntity.set(entityId, { layer, keys });
        return true;
    }

    release(entityId: number): void {
        const claim = this.byEntity.get(entityId);
        if (!claim) return;
        for (const key of claim.keys) {
            const cell = this.cells.get(key);
            if (!cell) continue;
            if (cell[claim.layer] === entityId) {
                delete cell[claim.layer];
            }
            if (
                cell.floor === undefined &&
                cell.structure === undefined &&
                cell.roof === undefined
            ) {
                this.cells.delete(key);
            }
        }
        this.byEntity.delete(entityId);
    }
}
