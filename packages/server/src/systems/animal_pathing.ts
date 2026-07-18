import {
    worldToTile,
    tileCenterWorld,
    WORLD_TILES,
    TILE_SIZE,
    FOOTPRINT_CIRCLE_RADIUS,
} from "@bundu/shared/tiles.js";
import { TileEntity } from "../components/base.js";
import { isSolidTileEntity } from "../configs/loaders/placement_rules.js";
import type { World } from "../engine/index.js";
import { gameplayConfig } from "../configs/gameplay.js";
import { tilesOverlappingCircle } from "./position.js";

function solidOccupantAt(
    world: World,
    x: number,
    y: number
): number | undefined {
    for (const id of world.context.occupancy.occupants(x, y)) {
        const object = world.getObject(id);
        if (object && TileEntity.get(object) && isSolidTileEntity(object)) {
            return id;
        }
    }
    return undefined;
}

export type Tile = { x: number; y: number };
export type WorldPoint = { x: number; y: number };

const key = (tile: Tile) => `${tile.x},${tile.y}`;
const manhattan = (a: Tile, b: Tile) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/** True if a circle overlaps any occupied tile footprint circle (matches CollisionSystem). */
export function footprintOverlaps(
    world: World,
    x: number,
    y: number,
    radius: number
): boolean {
    const bounds = tilesOverlappingCircle(
        { x, y },
        radius + FOOTPRINT_CIRCLE_RADIUS
    );
    for (let tx = bounds.minX; tx <= bounds.maxX; tx++) {
        for (let ty = bounds.minY; ty <= bounds.maxY; ty++) {
            if (solidOccupantAt(world, tx, ty) === undefined) continue;
            const cx = tileCenterWorld(tx);
            const cy = tileCenterWorld(ty);
            if (Math.hypot(x - cx, y - cy) < radius + FOOTPRINT_CIRCLE_RADIUS) {
                return true;
            }
        }
    }
    return false;
}

export function tileBlockedFor(
    world: World,
    tile: Tile,
    radius: number
): boolean {
    return footprintOverlaps(
        world,
        tileCenterWorld(tile.x),
        tileCenterWorld(tile.y),
        radius
    );
}

/** Sampled clearance along a world-space segment (thick agent, not a grid point). */
export function hasClearance(
    world: World,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    radius: number
): boolean {
    const dist = Math.hypot(toX - fromX, toY - fromY);
    if (dist < 1e-6) return !footprintOverlaps(world, fromX, fromY, radius);
    const step = TILE_SIZE * gameplayConfig().animalAi.clearanceStepTiles;
    const steps = Math.max(1, Math.ceil(dist / step));
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        if (
            footprintOverlaps(
                world,
                fromX + (toX - fromX) * t,
                fromY + (toY - fromY) * t,
                radius
            )
        ) {
            return false;
        }
    }
    return true;
}

function edgeClear(
    world: World,
    from: Tile,
    to: Tile,
    radius: number
): boolean {
    return hasClearance(
        world,
        tileCenterWorld(from.x),
        tileCenterWorld(from.y),
        tileCenterWorld(to.x),
        tileCenterWorld(to.y),
        radius
    );
}

/**
 * A* over tile centers. Start/goal may be blocked (chase into structures).
 * Neighbor edges require thick-agent clearance so paths don't cut corners
 * through footprint circles the grid alone would miss.
 */
export function pathTo(
    world: World,
    start: Tile,
    goal: Tile,
    radius: number
): Tile[] {
    const open: Tile[] = [start];
    const previous = new Map<string, Tile>();
    const cost = new Map([[key(start), 0]]);
    const closed = new Set<string>();
    const limit = gameplayConfig().animalAi.pathLimit;

    while (open.length && closed.size < limit) {
        let bestIdx = 0;
        let bestScore = Infinity;
        for (let i = 0; i < open.length; i++) {
            const tile = open[i];
            if (!tile) continue;
            const score = (cost.get(key(tile)) ?? 0) + manhattan(tile, goal);
            if (score < bestScore) {
                bestScore = score;
                bestIdx = i;
            }
        }
        const current = open.splice(bestIdx, 1)[0];
        if (!current) break;
        if (current.x === goal.x && current.y === goal.y) {
            const path: Tile[] = [];
            for (
                let at: Tile | undefined = current;
                at && key(at) !== key(start);
                at = previous.get(key(at))
            ) {
                path.unshift(at);
            }
            return path;
        }
        closed.add(key(current));
        for (const next of [
            { x: current.x + 1, y: current.y },
            { x: current.x - 1, y: current.y },
            { x: current.x, y: current.y + 1 },
            { x: current.x, y: current.y - 1 },
        ]) {
            if (
                next.x < 1 ||
                next.y < 1 ||
                next.x >= WORLD_TILES - 1 ||
                next.y >= WORLD_TILES - 1
            ) {
                continue;
            }
            if (closed.has(key(next))) continue;
            if (key(next) !== key(goal) && tileBlockedFor(world, next, radius)) {
                continue;
            }
            // Skip corner-cutting / mid-edge collisions between tile centers.
            if (
                key(current) !== key(start) &&
                key(next) !== key(goal) &&
                !edgeClear(world, current, next, radius)
            ) {
                continue;
            }
            const nextCost = (cost.get(key(current)) ?? 0) + 1;
            if (nextCost >= (cost.get(key(next)) ?? Infinity)) continue;
            previous.set(key(next), current);
            cost.set(key(next), nextCost);
            if (!open.some((tile) => key(tile) === key(next))) open.push(next);
        }
    }
    return [];
}

/** First occupied tile on the grid line from → to (exclusive of start). */
export function firstBlocker(
    world: World,
    from: Tile,
    to: Tile
): { id: number; tile: Tile } | undefined {
    let x = from.x;
    let y = from.y;
    const stepX = Math.sign(to.x - x);
    const stepY = Math.sign(to.y - y);
    const dx = Math.abs(to.x - x);
    const dy = Math.abs(to.y - y);
    let error = dx - dy;

    while (x !== to.x || y !== to.y) {
        const twiceError = error * 2;
        if (twiceError > -dy) {
            error -= dy;
            x += stepX;
        }
        if (twiceError < dx) {
            error += dx;
            y += stepY;
        }
        if (x === to.x && y === to.y) break;
        const id = solidOccupantAt(world, x, y);
        if (id !== undefined) return { id, tile: { x, y } };
    }
    const endId = solidOccupantAt(world, to.x, to.y);
    return endId === undefined
        ? undefined
        : { id: endId, tile: { x: to.x, y: to.y } };
}

/** World tile under a point. */
export function tileAt(point: WorldPoint): Tile {
    return { x: worldToTile(point.x), y: worldToTile(point.y) };
}

/** Tile-center waypoints for a grid path. */
export function tileCenters(path: Tile[]): WorldPoint[] {
    return path.map((tile) => ({
        x: tileCenterWorld(tile.x),
        y: tileCenterWorld(tile.y),
    }));
}
