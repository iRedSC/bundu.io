import {
    FOOTPRINT_CIRCLE_RADIUS,
    tileCenterWorld,
} from "@bundu/shared/tiles";
import { AnimalData, CalculateCollisions, Physics, TileEntity } from "../components/base.js";
import { isSolidTileEntity } from "../configs/loaders/placement_rules.js";
import { System, type GameObject, type World } from "../engine";
import { getSizedBounds, tilesOverlappingCircle } from "./position.js";
import { Circle, Response, testCircleCircle, Vector } from "sat";
import { GameEvent, type GameEventMap } from "./event_map.js";

const MAX_COLLISION_TRIES = 5;

/**
 * After Move applies intent, push movers out of occupied footprint circles,
 * then emit Collide once.
 */
export class CollisionSystem extends System<GameEventMap> {
    constructor(world: World) {
        super(world, [Physics, CalculateCollisions], 10);

        this.listen(GameEvent.Move, this.afterMove);
    }

    afterMove({ object }: GameEvent.Move) {
        this.resolve(object, 0);
        this.separateAnimals(object);
        this.resolve(object, 0);
        this.trigger(GameEvent.Collide, { object });
    }

    private resolve(target: GameObject, tries: number) {
        const physics = target.get(Physics);
        const { occupancy } = this.world.context;
        const reach = physics.collisionRadius + FOOTPRINT_CIRCLE_RADIUS;
        const bounds = tilesOverlappingCircle(physics.position, reach);

        const response = new Response();
        const center = new Vector();
        const tileCircle = new Circle(center, FOOTPRINT_CIRCLE_RADIUS);
        let hit = false;

        for (let tx = bounds.minX; tx <= bounds.maxX; tx++) {
            for (let ty = bounds.minY; ty <= bounds.maxY; ty++) {
                for (const entityId of occupancy.occupants(tx, ty)) {
                    if (entityId === target.id) continue;

                    const other = this.world.getObject(entityId);
                    if (
                        !other ||
                        !TileEntity.get(other) ||
                        !isSolidTileEntity(other)
                    ) {
                        continue;
                    }

                    center.x = tileCenterWorld(tx);
                    center.y = tileCenterWorld(ty);
                    response.clear();
                    if (
                        testCircleCircle(physics.collider, tileCircle, response)
                    ) {
                        hit = true;
                        physics.position.sub(response.overlapV);
                    }
                }
            }
        }

        if (hit && tries < MAX_COLLISION_TRIES) {
            this.resolve(target, tries + 1);
        }
    }

    /** Soft push so animals don't stack on the same spot. */
    private separateAnimals(target: GameObject) {
        if (!AnimalData.get(target)) return;
        const physics = target.get(Physics);
        const pad = physics.collisionRadius * 2;
        const others = this.world.query(
            [AnimalData, Physics],
            this.world.context.quadtree.query(
                getSizedBounds(physics.position, pad, pad)
            )
        );

        for (const other of others) {
            if (other.id === target.id) continue;
            const otherPhys = other.get(Physics);
            const dx = physics.position.x - otherPhys.position.x;
            const dy = physics.position.y - otherPhys.position.y;
            const dist = Math.hypot(dx, dy);
            const minDist = physics.collisionRadius + otherPhys.collisionRadius;
            if (dist >= minDist) continue;

            if (dist < 1e-6) {
                physics.position.x += minDist;
                continue;
            }
            // Move the active animal fully out of overlap (other may move next tick).
            const push = minDist - dist;
            physics.position.x += (dx / dist) * push;
            physics.position.y += (dy / dist) * push;
        }
    }
}
