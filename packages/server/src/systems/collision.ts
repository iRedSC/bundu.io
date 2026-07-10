import {
    FOOTPRINT_CIRCLE_RADIUS,
    tileCenterWorld,
} from "@bundu/shared/tiles";
import { CalculateCollisions, Physics, TileEntity } from "../components/base.js";
import { System, GameObject, type World } from "../engine";
import { tilesOverlappingCircle } from "./position.js";
import { Circle, Response, testCircleCircle, Vector } from "sat";
import { GameEvent, type GameEventMap } from "./event_map.js";

const MAX_COLLISION_TRIES = 3;

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
                const entityId = occupancy.get(tx, ty);
                if (entityId === undefined || entityId === target.id) continue;

                const other = this.world.getObject(entityId);
                if (!other || !TileEntity.get(other)) continue;

                center.x = tileCenterWorld(tx);
                center.y = tileCenterWorld(ty);
                if (testCircleCircle(physics.collider, tileCircle, response)) {
                    hit = true;
                    physics.position.sub(response.overlapV);
                }
            }
        }

        if (hit && tries < MAX_COLLISION_TRIES) {
            this.resolve(target, tries + 1);
        }
    }
}
