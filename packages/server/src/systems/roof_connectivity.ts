import { tileKey, type TilePos } from "@bundu/shared/tiles";

export const ORTHO: readonly TilePos[] = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
];

/** Chebyshev radius for the cheap local reconnect check. */
export const ROOF_HALO_RADIUS = 2;

export type RoofTileIndex = {
    /** Roof entity id on the roof layer, if any. */
    roofAt(x: number, y: number): number | undefined;
    /** Footprint tiles for a roof entity. */
    footprint(entityId: number): readonly TilePos[];
};

type GroupTile = { x: number; y: number; id: number };

/** Ortho-neighbor roof entity ids around a footprint, excluding `selfId`. */
export function adjacentRoofIds(
    index: RoofTileIndex,
    footprint: readonly TilePos[],
    selfId: number
): number[] {
    const found = new Set<number>();
    for (const { x, y } of footprint) {
        for (const step of ORTHO) {
            const id = index.roofAt(x + step.x, y + step.y);
            if (id !== undefined && id !== selfId) found.add(id);
        }
    }
    return [...found];
}

/**
 * Same-group stump tiles: ortho-adjacent to `footprint`, owned by another roof
 * whose id is in `memberIds`.
 */
export function stumpTiles(
    index: RoofTileIndex,
    footprint: readonly TilePos[],
    memberIds: ReadonlySet<number>,
    deletedId: number
): TilePos[] {
    const seen = new Set<number>();
    const stumps: TilePos[] = [];
    for (const { x, y } of footprint) {
        for (const step of ORTHO) {
            const nx = x + step.x;
            const ny = y + step.y;
            const id = index.roofAt(nx, ny);
            if (
                id === undefined ||
                id === deletedId ||
                !memberIds.has(id)
            ) {
                continue;
            }
            const key = tileKey(nx, ny);
            if (seen.has(key)) continue;
            seen.add(key);
            stumps.push({ x: nx, y: ny });
        }
    }
    return stumps;
}

function collectGroupTiles(
    index: RoofTileIndex,
    memberIds: ReadonlySet<number>
): Map<number, GroupTile> {
    const tiles = new Map<number, GroupTile>();
    for (const id of memberIds) {
        for (const { x, y } of index.footprint(id)) {
            tiles.set(tileKey(x, y), { x, y, id });
        }
    }
    return tiles;
}

function inHalo(
    x: number,
    y: number,
    footprint: readonly TilePos[],
    radius: number
): boolean {
    for (const cell of footprint) {
        if (Math.max(Math.abs(x - cell.x), Math.abs(y - cell.y)) <= radius) {
            return true;
        }
    }
    return false;
}

/**
 * BFS over `allowed` tiles from `start`, stopping once every stump key is reached.
 * Returns whether all stumps were reached.
 */
function stumpsConnected(
    start: TilePos,
    stumpKeys: ReadonlySet<number>,
    allowed: ReadonlyMap<number, GroupTile>
): boolean {
    if (stumpKeys.size <= 1) return true;
    const startKey = tileKey(start.x, start.y);
    if (!allowed.has(startKey)) return false;

    const remaining = new Set(stumpKeys);
    remaining.delete(startKey);
    if (remaining.size === 0) return true;

    const queue: TilePos[] = [start];
    const visited = new Set<number>([startKey]);

    while (queue.length > 0) {
        const cell = queue.pop();
        if (!cell) break;
        for (const step of ORTHO) {
            const nx = cell.x + step.x;
            const ny = cell.y + step.y;
            const key = tileKey(nx, ny);
            if (visited.has(key) || !allowed.has(key)) continue;
            visited.add(key);
            remaining.delete(key);
            if (remaining.size === 0) return true;
            queue.push({ x: nx, y: ny });
        }
    }
    return remaining.size === 0;
}

/** True when all stumps reconnect inside the chebyshev halo around the hole. */
export function haloConnectsStumps(
    index: RoofTileIndex,
    deletedFootprint: readonly TilePos[],
    memberIds: ReadonlySet<number>,
    stumps: readonly TilePos[],
    radius: number = ROOF_HALO_RADIUS
): boolean {
    if (stumps.length <= 1) return true;
    const groupTiles = collectGroupTiles(index, memberIds);
    const halo = new Map<number, GroupTile>();
    for (const [key, tile] of groupTiles) {
        if (inHalo(tile.x, tile.y, deletedFootprint, radius)) {
            halo.set(key, tile);
        }
    }
    const stumpKeys = new Set(stumps.map((s) => tileKey(s.x, s.y)));
    const start = stumps[0];
    if (!start) return true;
    return stumpsConnected(start, stumpKeys, halo);
}

/**
 * Early-exit flood: stumps still one component in the remaining group?
 * If not, returns each connected component as entity-id sets (split pieces).
 * If still connected, returns `undefined`.
 */
export function splitComponentsAfterDelete(
    index: RoofTileIndex,
    memberIds: ReadonlySet<number>,
    stumps: readonly TilePos[]
): number[][] | undefined {
    if (stumps.length <= 1) return undefined;

    const groupTiles = collectGroupTiles(index, memberIds);
    const stumpKeys = new Set(stumps.map((s) => tileKey(s.x, s.y)));
    const start = stumps[0];
    if (!start) return undefined;

    if (stumpsConnected(start, stumpKeys, groupTiles)) {
        return undefined;
    }

    const unclaimed = new Set(memberIds);
    const components: number[][] = [];

    const floodEntityComponent = (from: TilePos): number[] => {
        const startKey = tileKey(from.x, from.y);
        if (!groupTiles.has(startKey)) return [];
        const entities = new Set<number>();
        const queue: TilePos[] = [from];
        const visited = new Set<number>([startKey]);
        const first = groupTiles.get(startKey);
        if (first) entities.add(first.id);

        while (queue.length > 0) {
            const cell = queue.pop();
            if (!cell) break;
            for (const step of ORTHO) {
                const nx = cell.x + step.x;
                const ny = cell.y + step.y;
                const key = tileKey(nx, ny);
                if (visited.has(key)) continue;
                const tile = groupTiles.get(key);
                if (!tile) continue;
                visited.add(key);
                entities.add(tile.id);
                queue.push({ x: nx, y: ny });
            }
        }
        for (const id of entities) unclaimed.delete(id);
        return [...entities];
    };

    for (const stump of stumps) {
        const tile = groupTiles.get(tileKey(stump.x, stump.y));
        if (!tile || !unclaimed.has(tile.id)) continue;
        const component = floodEntityComponent(stump);
        if (component.length > 0) components.push(component);
    }

    while (unclaimed.size > 0) {
        const id = unclaimed.values().next().value;
        if (id === undefined) break;
        const fp = index.footprint(id);
        const origin = fp[0];
        if (!origin) {
            unclaimed.delete(id);
            continue;
        }
        const component = floodEntityComponent(origin);
        if (component.length > 0) components.push(component);
        else unclaimed.delete(id);
    }

    return components.length > 1 ? components : undefined;
}
