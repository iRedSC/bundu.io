import { degrees, moveToward } from "@bundu/shared/transforms.js";
import { worldToTile, tileCenterWorld, WORLD_TILES } from "@bundu/shared/tiles.js";
import { random } from "@bundu/shared/random.js";
import { AnimalData, Health, Physics, Type } from "../components/base.js";
import { AnimalConfigs } from "../configs/loaders/animals.js";
import { PlayerData } from "../components/player.js";
import { Resource } from "../game_objects/resource.js";
import { System, type GameObject, type World } from "../engine/index.js";
import { GameEvent, type GameEventMap } from "./event_map.js";
import { getSizedBounds } from "./position.js";
import { Circle, Vector } from "sat";
import { getNumericId } from "@bundu/shared/id_map.js";
import { SERVER_TICK_MS } from "@bundu/shared/movement.js";

const THINK_MS = 250;
const PATH_LIMIT = 96;

type Tile = { x: number; y: number };
const key = (tile: Tile) => `${tile.x},${tile.y}`;
const distance = (a: Tile, b: Tile) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

function pathTo(world: World, start: Tile, goal: Tile): Tile[] {
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
            if (world.context.occupancy.get(next.x, next.y) !== undefined || closed.has(key(next))) continue;
            const nextCost = (cost.get(key(current)) ?? 0) + 1;
            if (nextCost >= (cost.get(key(next)) ?? Infinity)) continue;
            previous.set(key(next), current); cost.set(key(next), nextCost);
            if (!open.some((tile) => key(tile) === key(next))) open.push(next);
        }
    }
    return [];
}

/** Grid line-of-sight for the common unobstructed case. */
function hasLineOfSight(world: World, from: Tile, to: Tile): boolean {
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
        if (world.context.occupancy.get(x, y) !== undefined) return false;
    }
    return true;
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
            const start = {
                x: worldToTile(physics.position.x),
                y: worldToTile(physics.position.y),
            };
            const goal = {
                x: worldToTile(target.x),
                y: worldToTile(target.y),
            };
            if (!hasLineOfSight(this.world, start, goal)) {
                data.path = pathTo(this.world, start, goal).map((tile) => ({
                    x: tileCenterWorld(tile.x),
                    y: tileCenterWorld(tile.y),
                }));
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

    private think(time: number, animal: GameObject) {
        const data = animal.get(AnimalData); const physics = animal.get(Physics); const config = AnimalConfigs.get(animal.get(Type).id);
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
        const nearest = players.sort((a, b) => Math.hypot(a.get(Physics).position.x - physics.position.x, a.get(Physics).position.y - physics.position.y) - Math.hypot(b.get(Physics).position.x - physics.position.x, b.get(Physics).position.y - physics.position.y))[0];
        if (config.behavior === "scared" && nearest) return this.flee(animal, nearest, time);
        const target =
            data.targetId === undefined
                ? undefined
                : this.world.getObject(data.targetId);
        if (
            target &&
            Math.hypot(
                target.get(Physics).position.x - physics.position.x,
                target.get(Physics).position.y - physics.position.y
            ) > config.loseSightRange
        ) {
            data.targetId = undefined;
        }
        const retainedTarget = data.targetId === undefined ? undefined : target;
        if ((config.behavior === "hostile" && nearest) || retainedTarget) {
            const victim = retainedTarget ?? nearest;
            if (victim) return this.chase(time, animal, victim);
        }
        if (!data.destination && (data.stateUntil <= time || data.state === "idle")) {
            data.state = "wander"; data.stateUntil = time + 1500 + random.integer(0, 2500); data.path = [];
            data.destination = { x: data.home.x + random.integer(-config.wander_distance, config.wander_distance), y: data.home.y + random.integer(-config.wander_distance, config.wander_distance) };
        }
    }

    private chase(time: number, animal: GameObject, target: GameObject) {
        const data = animal.get(AnimalData); const physics = animal.get(Physics); const other = target.get(Physics); const config = AnimalConfigs.get(animal.get(Type).id);
        data.state = "chase"; data.targetId = target.id;
        const d = Math.hypot(other.position.x - physics.position.x, other.position.y - physics.position.y);
        if (d <= config.attack_reach) {
            data.destination = undefined; data.path = [];
            if (time >= data.nextAttackAt) { data.nextAttackAt = time + config.attack_interval_ms; this.trigger(GameEvent.Attack, { object: animal, damage: config.attack_damage, hitbox: { start: 0, length: config.attack_reach, width: config.collision_radius * 2 } }); }
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
        const config = AnimalConfigs.get(object.get(Type).id); const data = object.get(AnimalData);
        if (!source) return;
        if (config.behavior === "neutral") data.targetId = source.id;
        if (config.behavior === "passive" || config.behavior === "scared") this.flee(object, source, this.world.gameTime);
    };

    private kill = ({ object }: GameEvent.Kill) => {
        if (!object.active) return;
        const physics = object.get(Physics); const config = AnimalConfigs.get(object.get(Type).id); const corpseId = getNumericId(config.corpse);
        object.active = false; this.trigger(GameEvent.DeleteObject, { object });
        if (typeof corpseId !== "number") return;
        const position = new Vector(physics.position.x, physics.position.y);
        this.world.addObject(new Resource({ position, collider: new Circle(position, physics.collisionRadius), collisionRadius: physics.collisionRadius, rotation: physics.rotation, speed: 0 }, { id: corpseId, variant: "base" }));
    };
}
