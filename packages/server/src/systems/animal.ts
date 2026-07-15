import { degrees, moveToward } from "@bundu/shared/transforms.js";
import {
    worldToTile,
    tileCenterWorld,
    WORLD_TILES,
    TILE_SIZE,
    FOOTPRINT_CIRCLE_RADIUS,
} from "@bundu/shared/tiles.js";
import { random } from "@bundu/shared/random.js";
import { AnimalData, Health, Physics, TileEntity, Type } from "../components/base.js";
import { AnimalConfigs } from "../configs/loaders/animals.js";
import { PlayerData } from "../components/player.js";
import { Resource } from "../game_objects/resource.js";
import { System, type GameObject, type World } from "../engine/index.js";
import { GameEvent, type GameEventMap } from "./event_map.js";
import { getSizedBounds, tilesOverlappingCircle } from "./position.js";
import { Circle, Vector } from "sat";
import { getNumericId } from "@bundu/shared/id_map.js";
import { SERVER_TICK_MS } from "@bundu/shared/movement.js";
import { Attributes } from "../components/attributes.js";

const THINK_MS = 250;
const PATH_LIMIT = 96;
const AGGRO_CHECK_MS = 2500;
const AGGRO_LOST_MS = 1000;
const AGGRO_DROP_CHANCE = 35; // percent, rolled every AGGRO_CHECK_MS

type Tile = { x: number; y: number };
const key = (tile: Tile) => `${tile.x},${tile.y}`;
const distance = (a: Tile, b: Tile) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/** True if a circle overlaps any occupied tile footprint circle (matches CollisionSystem). */
function footprintOverlaps(
    world: World,
    x: number,
    y: number,
    radius: number
): boolean {
    const bounds = tilesOverlappingCircle({ x, y }, radius + FOOTPRINT_CIRCLE_RADIUS);
    for (let tx = bounds.minX; tx <= bounds.maxX; tx++) {
        for (let ty = bounds.minY; ty <= bounds.maxY; ty++) {
            if (world.context.occupancy.get(tx, ty) === undefined) continue;
            const cx = tileCenterWorld(tx);
            const cy = tileCenterWorld(ty);
            if (Math.hypot(x - cx, y - cy) < radius + FOOTPRINT_CIRCLE_RADIUS) {
                return true;
            }
        }
    }
    return false;
}

function tileBlockedFor(world: World, tile: Tile, radius: number): boolean {
    return footprintOverlaps(
        world,
        tileCenterWorld(tile.x),
        tileCenterWorld(tile.y),
        radius
    );
}

/** Sampled clearance along a world-space segment (thick agent, not a grid point). */
function hasClearance(
    world: World,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    radius: number
): boolean {
    const dist = Math.hypot(toX - fromX, toY - fromY);
    if (dist < 1e-6) return !footprintOverlaps(world, fromX, fromY, radius);
    const steps = Math.max(1, Math.ceil(dist / (TILE_SIZE * 0.25)));
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

function pathTo(world: World, start: Tile, goal: Tile, radius: number): Tile[] {
    // Goal may sit inside a structure (chase target); allow standing on start/goal tiles.
    const open = [start];
    const previous = new Map<string, Tile>();
    const cost = new Map([[key(start), 0]]);
    const closed = new Set<string>();
    while (open.length && closed.size < PATH_LIMIT) {
        open.sort((a, b) => (cost.get(key(a)) ?? 0) + distance(a, goal) - ((cost.get(key(b)) ?? 0) + distance(b, goal)));
        const current = open.shift();
        if (!current) break;
        if (current.x === goal.x && current.y === goal.y) {
            const path: Tile[] = [];
            for (let at: Tile | undefined = current; at && key(at) !== key(start); at = previous.get(key(at))) path.unshift(at);
            return path;
        }
        closed.add(key(current));
        for (const next of [{ x: current.x + 1, y: current.y }, { x: current.x - 1, y: current.y }, { x: current.x, y: current.y + 1 }, { x: current.x, y: current.y - 1 }]) {
            if (next.x < 1 || next.y < 1 || next.x >= WORLD_TILES - 1 || next.y >= WORLD_TILES - 1) continue;
            if (closed.has(key(next))) continue;
            if (
                key(next) !== key(goal) &&
                tileBlockedFor(world, next, radius)
            ) {
                continue;
            }
            const nextCost = (cost.get(key(current)) ?? 0) + 1;
            if (nextCost >= (cost.get(key(next)) ?? Infinity)) continue;
            previous.set(key(next), current); cost.set(key(next), nextCost);
            if (!open.some((tile) => key(tile) === key(next))) open.push(next);
        }
    }
    return [];
}

/** First occupied tile on the grid line from → to (exclusive of start). */
function firstBlocker(
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
        const id = world.context.occupancy.get(x, y);
        if (id !== undefined) return { id, tile: { x, y } };
    }
    const endId = world.context.occupancy.get(to.x, to.y);
    return endId === undefined ? undefined : { id: endId, tile: { x: to.x, y: to.y } };
}

function playerDistance(animal: Physics, player: GameObject) {
    const pos = player.get(Physics).position;
    return Math.hypot(pos.x - animal.position.x, pos.y - animal.position.y);
}

export class AnimalSystem extends System<GameEventMap> {
    constructor(world: World) {
        super(world, [AnimalData, Physics, Health], 4);
        this.listen(GameEvent.Hurt, this.hurt, [AnimalData]);
        this.listen(GameEvent.Kill, this.kill, [AnimalData]);
    }

    override update(time: number, delta: number, animal: GameObject) {
        const data = animal.get(AnimalData); const physics = animal.get(Physics);
        const config = AnimalConfigs.get(animal.get(Type).id);
        if (time >= data.nextThinkAt) { data.nextThinkAt = time + THINK_MS; this.think(time, animal); }
        const target = data.destination;
        if (!target) return;
        if (data.path.length === 0) {
            const radius = physics.collisionRadius;
            const start = {
                x: worldToTile(physics.position.x),
                y: worldToTile(physics.position.y),
            };
            const goal = {
                x: worldToTile(target.x),
                y: worldToTile(target.y),
            };
            if (
                !hasClearance(
                    this.world,
                    physics.position.x,
                    physics.position.y,
                    target.x,
                    target.y,
                    radius
                )
            ) {
                data.path = pathTo(this.world, start, goal, radius).map((tile) => ({
                    x: tileCenterWorld(tile.x),
                    y: tileCenterWorld(tile.y),
                }));
                // Fully blocked while chasing — smash destructible obstacles in the way.
                // Wander: abandon the destination so think() can pick a new roam target.
                if (data.path.length === 0) {
                    if (data.state === "chase" && config.attack_damage > 0) {
                        const blocker = firstBlocker(this.world, start, goal);
                        if (
                            blocker &&
                            this.attackObstacle(time, animal, blocker)
                        ) {
                            return;
                        }
                    }
                    if (data.state === "wander") {
                        data.destination = undefined;
                        return;
                    }
                }
            }
        }
        const waypoint = data.path[0] ?? target;
        const dx = waypoint.x - physics.position.x; const dy = waypoint.y - physics.position.y;
        const length = Math.hypot(dx, dy);
        // Attack boxes use the player convention: 0° points up.
        physics.rotation = degrees(Math.atan2(dy, dx) - Math.PI / 2);
        const speed =
            data.state === "chase" || data.state === "flee"
                ? config.activeSpeed
                : config.passiveSpeed;
        const moveDistance = speed * (delta / SERVER_TICK_MS);
        const reachesWaypoint = length <= moveDistance;
        const step = moveToward(
            { x: 0, y: 0 },
            { x: dx, y: dy },
            Math.min(moveDistance, length)
        );
        this.trigger(GameEvent.Move, { object: animal, x: -step.x, y: -step.y });
        if (!reachesWaypoint) return;

        data.path.shift();
        if (data.path.length === 0) data.destination = undefined;
    }

    /**
     * Face a blocking tile. Returns true when in range and attacking
     * (caller should skip movement); false when still approaching.
     */
    private attackObstacle(
        time: number,
        animal: GameObject,
        blocker: { id: number; tile: Tile }
    ): boolean {
        const obstacle = this.world.getObject(blocker.id);
        // Resources/harvest nodes ignore animal Hurt — only smash Health-bearing structures.
        if (!obstacle || !Health.get(obstacle)) {
            const data = animal.get(AnimalData);
            data.destination = undefined;
            data.path = [];
            return false;
        }
        const data = animal.get(AnimalData);
        const physics = animal.get(Physics);
        const config = AnimalConfigs.get(animal.get(Type).id);
        const targetX = tileCenterWorld(blocker.tile.x);
        const targetY = tileCenterWorld(blocker.tile.y);
        const dx = targetX - physics.position.x;
        const dy = targetY - physics.position.y;
        physics.rotation = degrees(Math.atan2(dy, dx) - Math.PI / 2);
        const reach = animal.get(Attributes).get("attack.reach");
        const d = Math.hypot(dx, dy);
        if (d > reach) {
            data.destination = { x: targetX, y: targetY };
            data.path = [];
            return false;
        }
        data.destination = undefined;
        data.path = [];
        if (time >= data.nextAttackAt) {
            data.nextAttackAt = time + config.attack_interval_ms;
            this.trigger(GameEvent.Attack, {
                object: animal,
                damage: config.attack_damage,
                hitbox: {
                    start: 0,
                    length: reach,
                    width: physics.collisionRadius * 2,
                },
            });
        }
        return true;
    }

    private think(time: number, animal: GameObject) {
        const data = animal.get(AnimalData);
        const physics = animal.get(Physics);
        const config = AnimalConfigs.get(animal.get(Type).id);
        const players = this.world.query(
            [PlayerData, Physics],
            this.world.context.quadtree.query(
                getSizedBounds(
                    physics.position,
                    config.detectionRange,
                    config.detectionRange
                )
            )
        );
        const nearest = players.sort(
            (a, b) => playerDistance(physics, a) - playerDistance(physics, b)
        )[0];

        if (config.behavior === "scared" && nearest) {
            return this.flee(animal, nearest, time);
        }

        if (time >= data.nextAggroCheckAt) {
            data.nextAggroCheckAt = time + AGGRO_CHECK_MS;
            this.tickAggro(time, animal, players);
        }

        if (time < data.lostAggroUntil) {
            return this.wanderIfIdle(time, animal);
        }

        const target =
            data.targetId === undefined
                ? undefined
                : this.world.getObject(data.targetId);
        if (target) {
            const d = playerDistance(physics, target);
            if (d > config.loseSightRange) data.targetId = undefined;
        }
        const retainedTarget =
            data.targetId === undefined
                ? undefined
                : this.world.getObject(data.targetId);
        const retainedPlayer =
            retainedTarget && PlayerData.get(retainedTarget)
                ? retainedTarget
                : undefined;
        const retainedStructure =
            retainedTarget && TileEntity.get(retainedTarget)
                ? retainedTarget
                : undefined;

        // Players always beat structure aggro.
        if ((config.behavior === "hostile" && nearest) || retainedPlayer) {
            const victim = retainedPlayer ?? nearest;
            if (victim) return this.chase(time, animal, victim);
        }

        if (config.aggroAt.length > 0 && config.attack_damage > 0) {
            const structure =
                retainedStructure ??
                this.nearestAggroStructure(animal, config.aggroAt, config.detectionRange);
            if (structure) return this.chase(time, animal, structure);
        }

        this.wanderIfIdle(time, animal);
    }

    private nearestAggroStructure(
        animal: GameObject,
        aggroAt: number[],
        range: number
    ): GameObject | undefined {
        const physics = animal.get(Physics);
        const wanted = new Set(aggroAt);
        const candidates = this.world.query(
            [TileEntity, Physics, Type, Health],
            this.world.context.quadtree.query(
                getSizedBounds(physics.position, range, range)
            )
        );
        let best: GameObject | undefined;
        let bestDist = Infinity;
        for (const structure of candidates) {
            if (!wanted.has(structure.get(Type).id)) continue;
            const d = playerDistance(physics, structure);
            if (d > range || d >= bestDist) continue;
            best = structure;
            bestDist = d;
        }
        return best;
    }

    private tickAggro(time: number, animal: GameObject, players: GameObject[]) {
        const data = animal.get(AnimalData);
        const physics = animal.get(Physics);
        const config = AnimalConfigs.get(animal.get(Type).id);

        if (
            config.aggroSwitch === "random" &&
            players.length > 0 &&
            (data.targetId !== undefined || config.behavior === "hostile")
        ) {
            data.targetId = players[random.integer(0, players.length - 1)]!.id;
            data.lostAggroUntil = 0;
        }

        if (data.targetId === undefined || config.aggroLevel === "high") return;

        const target = this.world.getObject(data.targetId);
        if (!target) {
            data.targetId = undefined;
            return;
        }
        const d = playerDistance(physics, target);
        const roll =
            config.aggroLevel === "low" ||
            d > config.loseSightRange * 0.5;
        if (roll && random.integer(1, 100) <= AGGRO_DROP_CHANCE) {
            data.targetId = undefined;
            data.lostAggroUntil = time + AGGRO_LOST_MS;
            data.destination = undefined;
            data.path = [];
            data.state = "idle";
        }
    }

    private wanderIfIdle(time: number, animal: GameObject) {
        const data = animal.get(AnimalData);
        const physics = animal.get(Physics);
        const config = AnimalConfigs.get(animal.get(Type).id);
        if (data.destination || (data.stateUntil > time && data.state !== "idle")) {
            return;
        }

        data.state = "wander";
        data.stateUntil = time + 1500 + random.integer(0, 2500);
        data.path = [];

        if (!config.hasHome) {
            data.destination = {
                x: physics.position.x + random.integer(-config.wander_distance, config.wander_distance),
                y: physics.position.y + random.integer(-config.wander_distance, config.wander_distance),
            };
            return;
        }

        // Alternate homeward and wander sessions so returns aren't a bee-line.
        if (data.roamPhase === "home") {
            data.destination = { x: data.home.x, y: data.home.y };
            data.roamPhase = "wander";
        } else {
            data.destination = {
                x: data.home.x + random.integer(-config.wander_distance, config.wander_distance),
                y: data.home.y + random.integer(-config.wander_distance, config.wander_distance),
            };
            data.roamPhase = "home";
        }
    }

    private chase(time: number, animal: GameObject, target: GameObject) {
        const data = animal.get(AnimalData); const physics = animal.get(Physics); const other = target.get(Physics); const config = AnimalConfigs.get(animal.get(Type).id);
        data.state = "chase"; data.targetId = target.id;
        const d = Math.hypot(other.position.x - physics.position.x, other.position.y - physics.position.y);
        const reach = animal.get(Attributes).get("attack.reach");
        if (d <= reach) {
            data.destination = undefined; data.path = [];
            if (time >= data.nextAttackAt) { data.nextAttackAt = time + config.attack_interval_ms; this.trigger(GameEvent.Attack, { object: animal, damage: config.attack_damage, hitbox: { start: 0, length: reach, width: physics.collisionRadius * 2 } }); }
            return;
        }
        data.destination = { x: other.position.x, y: other.position.y }; data.path = [];
    }

    private flee(animal: GameObject, threat: GameObject, time: number) {
        const data = animal.get(AnimalData); const physics = animal.get(Physics); const other = threat.get(Physics); const config = AnimalConfigs.get(animal.get(Type).id);
        const angle = Math.atan2(physics.position.y - other.position.y, physics.position.x - other.position.x);
        data.state = "flee"; data.stateUntil = time + 1500; data.targetId = undefined; data.path = [];
        data.destination = { x: physics.position.x + Math.cos(angle) * config.wander_distance, y: physics.position.y + Math.sin(angle) * config.wander_distance };
    }

    private hurt = ({ object, source }: GameEvent.Hurt) => {
        const config = AnimalConfigs.get(object.get(Type).id);
        const data = object.get(AnimalData);
        if (!source) return;
        if (config.behavior === "passive" || config.behavior === "scared") {
            this.flee(object, source, this.world.gameTime);
            return;
        }
        if (config.aggroSwitch === "onHit" || data.targetId === undefined) {
            data.targetId = source.id;
            data.lostAggroUntil = 0;
        }
    };

    private kill = ({ object }: GameEvent.Kill) => {
        if (!object.active) return;
        const physics = object.get(Physics);
        const config = AnimalConfigs.get(object.get(Type).id);
        const corpseId = getNumericId(config.corpse);
        const scale = object.get(Attributes).get("physics.scale");
        object.active = false;
        this.trigger(GameEvent.DeleteObject, { object });
        if (typeof corpseId !== "number") return;
        const position = new Vector(physics.position.x, physics.position.y);
        const baseRadius = TILE_SIZE / 2;
        this.world.addObject(
            new Resource(
                {
                    position,
                    collider: new Circle(position, baseRadius),
                    collisionRadius: baseRadius,
                    rotation: physics.rotation,
                    speed: 0,
                },
                { id: corpseId, variant: "base" },
                undefined,
                scale
            )
        );
    };
}
