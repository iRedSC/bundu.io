import { attackFacingRadians, degrees, moveToward, radians } from "@bundu/shared";
import { tileCenterWorld, TILE_SIZE } from "@bundu/shared/tiles.js";
import { random } from "@bundu/shared/random.js";
import { AnimalData, Health, Physics, TileEntity, Type } from "../components/base.js";
import {
    AnimalConfigs,
    type AnimalConfig,
} from "../configs/loaders/animals.js";
import { PlayerData } from "../components/player.js";
import { Resource } from "../game_objects/resource.js";
import { System, type GameObject, type World } from "../engine/index.js";
import { GameEvent, type GameEventMap } from "./event_map.js";
import { getSizedBounds } from "./position.js";
import { Circle, Vector } from "sat";
import { SERVER_TICK_MS } from "@bundu/shared/movement.js";
import { Attributes } from "../components/attributes.js";
import { gameplayConfig } from "../configs/gameplay.js";
import { areAnimalsFrozen } from "../admin/state.js";
import {
    firstBlocker,
    footprintOverlaps,
    hasClearance,
    nearestNonAvoidTile,
    pathTo,
    tileAt,
    tileCenters,
    tileIsAvoided,
    type PathGroundPolicy,
    type Tile,
    type WorldPoint,
} from "./animal_pathing.js";
import { nearestFootprintPoint } from "./tile_entity_geometry.js";
import { structureFootprintPadding } from "../configs/loaders/buildings.js";

/** Min travel before we treat an update as progress (world units). */
const PROGRESS_EPSILON = 1;
/** How far the chase destination may drift before we drop the cached path. */
const REPATH_TARGET_TILES = 1;
/** Attempts to sample a walkable wander point. */
const WANDER_SAMPLES = 8;

function avoidSet(config: AnimalConfig): ReadonlySet<number> {
    return new Set(config.movement.avoid.ground);
}

function onAvoidedGround(
    world: World,
    physics: Physics,
    avoid: ReadonlySet<number>
): boolean {
    return tileIsAvoided(world, tileAt(physics.position), avoid);
}

function playerDistance(animal: Physics, player: GameObject) {
    const tile = TileEntity.get(player);
    const pos = tile
        ? nearestFootprintPoint(tile.occupied, animal.position)
        : player.get(Physics).position;
    if (!pos) return Infinity;
    return Math.hypot(pos.x - animal.position.x, pos.y - animal.position.y);
}

function clearNav(data: AnimalData) {
    data.destination = undefined;
    data.path = [];
    data.stuckSince = 0;
}

/**
 * Animal AI: think + move at 4 TPS (step size scaled by delta).
 * Pathing / stuck handling keep animals from wedging on footprints.
 */
export class AnimalSystem extends System<GameEventMap> {
    constructor(world: World) {
        super(world, [AnimalData, Physics, Health], 4);
        this.listen(GameEvent.Hurt, this.hurt, [AnimalData]);
        this.listen(GameEvent.Kill, this.kill, [AnimalData]);
    }

    override update(time: number, delta: number, animal: GameObject) {
        if (areAnimalsFrozen()) return;

        const data = animal.get(AnimalData);
        const physics = animal.get(Physics);
        const config = AnimalConfigs.get(animal.get(Type).id);

        if (time >= data.nextThinkAt) {
            data.nextThinkAt = time + gameplayConfig().animalAi.thinkIntervalMs;
            this.think(time, animal);
        }

        const target = data.destination;
        if (!target) return;

        if (this.ensurePath(time, animal, target) === "blocked") return;

        // ensurePath / attackObstacle may retarget (e.g. smash approach).
        const seek = data.destination;
        if (!seek) return;

        const beforeX = physics.position.x;
        const beforeY = physics.position.y;
        const waypoint = data.path[0] ?? seek;
        const dx = waypoint.x - beforeX;
        const dy = waypoint.y - beforeY;
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
        this.trigger(GameEvent.Move, {
            object: animal,
            x: -step.x,
            y: -step.y,
        });

        this.trackProgress(time, data, physics, beforeX, beforeY);

        if (!reachesWaypoint) return;

        data.path.shift();
        if (data.path.length === 0) clearNav(data);
    }

    private groundPolicy(
        config: AnimalConfig,
        physics: Physics,
        emergency: boolean
    ): PathGroundPolicy | undefined {
        const avoid = avoidSet(config);
        if (avoid.size === 0) return undefined;
        const standingOnAvoid = onAvoidedGround(this.world, physics, avoid);
        return {
            avoid,
            strength: config.movement.avoid.strength,
            hard: config.movement.avoid.hard,
            emergency: emergency || standingOnAvoid,
        };
    }

    /**
     * If standing on avoided ground and the current destination is missing or
     * also avoided, aim at the nearest safe tile (always bypasses avoid).
     */
    private retargetOffAvoidedGround(
        animal: GameObject,
        config: AnimalConfig
    ): void {
        const avoid = avoidSet(config);
        if (avoid.size === 0) return;
        const data = animal.get(AnimalData);
        const physics = animal.get(Physics);
        if (!onAvoidedGround(this.world, physics, avoid)) return;

        const dest = data.destination;
        if (dest && !tileIsAvoided(this.world, tileAt(dest), avoid)) return;

        const safe = nearestNonAvoidTile(
            this.world,
            tileAt(physics.position),
            physics.collisionRadius,
            avoid
        );
        if (!safe) return;
        data.destination = {
            x: tileCenterWorld(safe.x),
            y: tileCenterWorld(safe.y),
        };
        data.path = [];
        data.stuckSince = 0;
    }

    /**
     * Build or validate a path to `target`. Returns `blocked` when the animal
     * should not try to step this frame (attacking / gave up).
     */
    private ensurePath(
        time: number,
        animal: GameObject,
        target: WorldPoint
    ): "ok" | "blocked" {
        const data = animal.get(AnimalData);
        const physics = animal.get(Physics);
        const radius = physics.collisionRadius;
        const config = AnimalConfigs.get(animal.get(Type).id);
        const ignorePreferred =
            config.ignorePreferredWhenAggro && data.state === "chase";
        if (!ignorePreferred) {
            this.retargetOffAvoidedGround(animal, config);
        }
        const seek = data.destination ?? target;
        const policy = this.groundPolicy(config, physics, ignorePreferred);

        // Drop a cached path if the next waypoint is no longer walkable.
        const nextWaypoint = data.path[0];
        if (
            nextWaypoint &&
            !hasClearance(
                this.world,
                physics.position.x,
                physics.position.y,
                nextWaypoint.x,
                nextWaypoint.y,
                radius,
                policy
            )
        ) {
            data.path = [];
        }

        if (data.path.length > 0) return "ok";

        if (
            hasClearance(
                this.world,
                physics.position.x,
                physics.position.y,
                seek.x,
                seek.y,
                radius,
                policy
            )
        ) {
            return "ok";
        }

        const start = tileAt(physics.position);
        const goal = tileAt(seek);
        data.path = tileCenters(
            pathTo(this.world, start, goal, radius, policy)
        );

        if (data.path.length > 0) return "ok";

        // Stuck against avoid / no soft path — retry with emergency if allowed
        // (also always allowed while already standing on avoided ground).
        if (
            policy &&
            !policy.emergency &&
            config.movement.allowEmergencyEscape
        ) {
            const emergencyPolicy = { ...policy, emergency: true };
            data.path = tileCenters(
                pathTo(this.world, start, goal, radius, emergencyPolicy)
            );
            if (data.path.length > 0) return "ok";
            if (
                hasClearance(
                    this.world,
                    physics.position.x,
                    physics.position.y,
                    seek.x,
                    seek.y,
                    radius,
                    emergencyPolicy
                )
            ) {
                return "ok";
            }
        }

        // Fully blocked while chasing — smash destructible obstacles.
        if (data.state === "chase" && config.attack_damage > 0) {
            const blocker = firstBlocker(this.world, start, goal);
            if (blocker) {
                if (this.attackObstacle(time, animal, blocker)) {
                    return "blocked";
                }
                // Approaching a smashable structure — keep that destination.
                if (data.destination) return "ok";
            }
        }

        // Cannot reach (resources, tight gaps, path limit). Abandon this
        // destination so think can retarget — do not walk into the wall.
        clearNav(data);
        return "blocked";
    }

    private trackProgress(
        time: number,
        data: AnimalData,
        physics: Physics,
        beforeX: number,
        beforeY: number
    ) {
        const moved = Math.hypot(
            physics.position.x - beforeX,
            physics.position.y - beforeY
        );
        if (moved >= PROGRESS_EPSILON) {
            data.stuckSince = 0;
            return;
        }
        if (data.stuckSince === 0) data.stuckSince = time;
        if (
            time - data.stuckSince <
            gameplayConfig().animalAi.stuckTimeoutMs
        ) {
            return;
        }
        // Wedged against a footprint / peer — drop nav and let think replan.
        clearNav(data);
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
            clearNav(animal.get(AnimalData));
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
            data.stuckSince = 0;
            return false;
        }

        clearNav(data);
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
        this.retargetOffAvoidedGround(animal, config);
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
            data.nextAggroCheckAt =
                time + gameplayConfig().animalAi.aggroCheckIntervalMs;
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
                this.nearestAggroStructure(
                    animal,
                    config.aggroAt,
                    config.detectionRange
                );
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
                getSizedBounds(
                    physics.position,
                    range + structureFootprintPadding(),
                    range + structureFootprintPadding()
                )
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
            const target = players[random.integer(0, players.length - 1)];
            if (target) {
                data.targetId = target.id;
                data.lostAggroUntil = 0;
            }
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
            d >
                config.loseSightRange *
                    gameplayConfig().animalAi.mediumAggroRangeRatio;
        if (
            roll &&
            random.integer(1, 100) <=
                gameplayConfig().animalAi.aggroDropChancePercent
        ) {
            data.targetId = undefined;
            data.lostAggroUntil = time + gameplayConfig().animalAi.aggroLostMs;
            clearNav(data);
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
        const ai = gameplayConfig().animalAi;
        data.stateUntil =
            time + ai.wanderMinMs + random.integer(0, ai.wanderVarianceMs);
        data.path = [];
        data.stuckSince = 0;
        data.destination = this.pickWanderPoint(
            physics,
            physics.position.x,
            physics.position.y,
            config.wander_distance,
            config
        );
    }

    /** Prefer open, non-avoided ground so wander doesn't aim into clumps / water. */
    private pickWanderPoint(
        physics: Physics,
        originX: number,
        originY: number,
        range: number,
        config: AnimalConfig
    ): WorldPoint | undefined {
        const radius = physics.collisionRadius;
        const avoid = avoidSet(config);
        let softFallback: WorldPoint | undefined;
        for (let i = 0; i < WANDER_SAMPLES; i++) {
            const point = {
                x: originX + random.integer(-range, range),
                y: originY + random.integer(-range, range),
            };
            if (footprintOverlaps(this.world, point.x, point.y, radius)) {
                continue;
            }
            const avoided = tileIsAvoided(this.world, tileAt(point), avoid);
            if (avoided && config.movement.avoid.hard) continue;
            if (avoided) {
                softFallback ??= point;
                continue;
            }
            return point;
        }
        return softFallback;
    }

    private chase(time: number, animal: GameObject, target: GameObject) {
        const data = animal.get(AnimalData);
        const physics = animal.get(Physics);
        const other = target.get(Physics);
        const targetPoint =
            nearestFootprintPoint(
                TileEntity.get(target)?.occupied ?? [],
                physics.position
            ) ?? other.position;
        const config = AnimalConfigs.get(animal.get(Type).id);

        data.state = "chase";
        data.targetId = target.id;

        const d = Math.hypot(
            targetPoint.x - physics.position.x,
            targetPoint.y - physics.position.y
        );
        const reach = animal.get(Attributes).get("attack.reach");
        if (d <= reach) {
            clearNav(data);
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
            return;
        }

        const next = { x: targetPoint.x, y: targetPoint.y };
        const destMoved =
            !data.destination ||
            Math.hypot(
                next.x - data.destination.x,
                next.y - data.destination.y
            ) >
                TILE_SIZE * REPATH_TARGET_TILES;
        data.destination = next;
        // Keep the cached path while the target hasn't moved far — clearing
        // every think forced constant repath / bee-line thrash.
        if (destMoved) {
            data.path = [];
            data.stuckSince = 0;
        }
    }

    private flee(animal: GameObject, threat: GameObject, time: number) {
        const data = animal.get(AnimalData);
        const physics = animal.get(Physics);
        const other = threat.get(Physics);
        const config = AnimalConfigs.get(animal.get(Type).id);

        // Keep the current flee leg until it expires — re-rolling every think
        // made scared animals dash in a new direction forever at active speed.
        if (
            data.state === "flee" &&
            data.stateUntil > time &&
            data.destination
        ) {
            return;
        }

        const angle = Math.atan2(
            physics.position.y - other.position.y,
            physics.position.x - other.position.x
        );
        data.state = "flee";
        data.stateUntil = time + gameplayConfig().animalAi.fleeMs;
        data.targetId = undefined;
        data.path = [];
        data.stuckSince = 0;
        const point = {
            x: physics.position.x + Math.cos(angle) * config.wander_distance,
            y: physics.position.y + Math.sin(angle) * config.wander_distance,
        };
        const avoid = avoidSet(config);
        if (
            avoid.size > 0 &&
            tileIsAvoided(this.world, tileAt(point), avoid) &&
            config.movement.avoid.hard
        ) {
            // Hard avoid: flee toward nearest safe tile instead of into water.
            const safe = nearestNonAvoidTile(
                this.world,
                tileAt(physics.position),
                physics.collisionRadius,
                avoid
            );
            data.destination = safe
                ? {
                      x: tileCenterWorld(safe.x),
                      y: tileCenterWorld(safe.y),
                  }
                : point;
            return;
        }
        data.destination = point;
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

    private kill = ({ object, source }: GameEvent.Kill) => {
        if (!object.active) return;
        const physics = object.get(Physics);
        const config = AnimalConfigs.get(object.get(Type).id);
        const player = source && PlayerData.get(source);
        if (player) player.score += config.score;
        const corpseId = config.corpse;
        const scale = object.get(Attributes).get("physics.scale");
        object.active = false;
        this.trigger(GameEvent.DeleteObject, { object });
        const position = new Vector(physics.position.x, physics.position.y);
        const baseRadius = TILE_SIZE / 2;
        // Living animals render in movement-facing space (0° = east); physics.rotation
        // uses the attack/player convention (0° = up). Convert so the corpse matches.
        this.world.addObject(
            new Resource(
                {
                    position,
                    collider: new Circle(position, baseRadius),
                    collisionRadius: baseRadius,
                    rotation: degrees(
                        attackFacingRadians(radians(physics.rotation))
                    ),
                    speed: 0,
                },
                { id: corpseId, variant: "base" },
                undefined,
                scale
            )
        );
    };
}
