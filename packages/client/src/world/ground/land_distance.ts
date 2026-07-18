import { TILE_SIZE, WORLD_TILES } from "@bundu/shared/tiles";
import type { GroundPatchRef } from "./shore";

const N = WORLD_TILES * WORLD_TILES;
/** Cap — enough for any point in a 200² map; keeps storage in one byte. */
export const LAND_DISTANCE_MAX = 255;

/**
 * Tile distance from nearest land. Built once per ground change; O(1) lookup.
 * Buffers are reused across rebuilds so live ground edits stay cheap.
 */
export class LandDistanceField {
    private readonly dist = new Uint8Array(N);
    private readonly land = new Uint8Array(N);
    private readonly queue = new Int32Array(N);

    /** Tiles from nearest land. `0` on land; capped at {@link LAND_DISTANCE_MAX}. */
    atTile(tx: number, ty: number): number {
        if (tx < 0 || ty < 0 || tx >= WORLD_TILES || ty >= WORLD_TILES) {
            return LAND_DISTANCE_MAX;
        }
        return this.dist[ty * WORLD_TILES + tx]!;
    }

    /** Same as {@link atTile}, from world pixels. */
    atWorld(worldX: number, worldY: number): number {
        return this.atTile((worldX / TILE_SIZE) | 0, (worldY / TILE_SIZE) | 0);
    }

    rebuild(
        patches: readonly GroundPatchRef[],
        isOceanType: (type: number) => boolean
    ): void {
        const { land, dist, queue } = this;
        land.fill(0);
        dist.fill(LAND_DISTANCE_MAX);

        // Paint ascending id so higher ids win (same stack as topGroundAt).
        const byBottom = [...patches].sort((a, b) => a.id - b.id);
        for (const patch of byBottom) {
            const isLand = !isOceanType(patch.type) ? 1 : 0;
            const x1 = Math.max(0, patch.x);
            const y1 = Math.max(0, patch.y);
            const x2 = Math.min(WORLD_TILES, patch.x + patch.w);
            const y2 = Math.min(WORLD_TILES, patch.y + patch.h);
            for (let ty = y1; ty < y2; ty++) {
                const row = ty * WORLD_TILES;
                for (let tx = x1; tx < x2; tx++) {
                    land[row + tx] = isLand;
                }
            }
        }

        let head = 0;
        let tail = 0;
        for (let i = 0; i < N; i++) {
            if (land[i] === 0) continue;
            dist[i] = 0;
            queue[tail++] = i;
        }

        // 8-connected multi-source BFS into ocean.
        while (head < tail) {
            const i = queue[head++]!;
            const d = dist[i]!;
            if (d >= LAND_DISTANCE_MAX) continue;
            const next = d + 1;
            const tx = i % WORLD_TILES;
            const ty = (i / WORLD_TILES) | 0;

            for (let dy = -1; dy <= 1; dy++) {
                const ny = ty + dy;
                if (ny < 0 || ny >= WORLD_TILES) continue;
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    const nx = tx + dx;
                    if (nx < 0 || nx >= WORLD_TILES) continue;
                    const ni = ny * WORLD_TILES + nx;
                    if (land[ni] !== 0) continue;
                    if (dist[ni]! <= next) continue;
                    dist[ni] = next;
                    queue[tail++] = ni;
                }
            }
        }
    }
}
