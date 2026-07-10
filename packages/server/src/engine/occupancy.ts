import { tileKey, type TilePos } from "@bundu/shared/tiles";

/**
 * Solid footprint occupancy: each tile → at most one tile-entity id.
 * Source of truth for static solids and placement checks.
 */
export class OccupancyGrid {
    private readonly cells = new Map<number, number>();
    private readonly byEntity = new Map<number, number[]>();

    get(x: number, y: number): number | undefined {
        return this.cells.get(tileKey(x, y));
    }

    canPlace(tiles: readonly TilePos[]): boolean {
        for (const { x, y } of tiles) {
            if (this.cells.has(tileKey(x, y))) return false;
        }
        return true;
    }

    /** Claim tiles for an entity. Releases any prior claim first. */
    occupy(entityId: number, tiles: readonly TilePos[]): boolean {
        this.release(entityId);
        if (!this.canPlace(tiles)) return false;

        const keys: number[] = [];
        for (const { x, y } of tiles) {
            const key = tileKey(x, y);
            this.cells.set(key, entityId);
            keys.push(key);
        }
        this.byEntity.set(entityId, keys);
        return true;
    }

    release(entityId: number): void {
        const keys = this.byEntity.get(entityId);
        if (!keys) return;
        for (const key of keys) {
            this.cells.delete(key);
        }
        this.byEntity.delete(entityId);
    }
}
