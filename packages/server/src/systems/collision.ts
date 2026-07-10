import { CalculateCollisions, Physics } from "../components/base.js";
import { System, GameObject, type World } from "../engine";
import {
    getSizedBounds,
    quadtree,
    SPATIAL_QUERY_PADDING,
} from "./position.js";
import { Response, testCircleCircle } from "sat";
import { GameEvent, type GameEventMap } from "./event_map.js";

const MAX_COLLISION_TRIES = 3;

/**
 * After Move applies intent, resolve solid overlaps then emit Collide once.
 * Retries stay internal — no re-entrant Move / mid-loop Collide fan-out.
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

        const bounds = getSizedBounds(
            physics.position,
            SPATIAL_QUERY_PADDING,
            SPATIAL_QUERY_PADDING
        );

        const nearby = this.world.query([Physics], quadtree.query(bounds));

        const response = new Response();
        let hit = false;
        for (const other of nearby) {
            if (other.id === target.id || !Physics.get(other).solid) {
                continue;
            }
            const otherPhysics = Physics.get(other);
            const collided = testCircleCircle(
                physics.collider,
                otherPhysics.collider,
                response
            );
            if (collided) {
                hit = true;
                physics.position.sub(response.overlapV);
            }
        }
        if (hit && tries < MAX_COLLISION_TRIES) {
            this.resolve(target, tries + 1);
        }
    }
}
