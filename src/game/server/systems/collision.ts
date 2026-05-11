import { CalculateCollisions, Physics } from "../components/base.js";
import { System, GameObject } from "@ioengine/server";
import { getSizedBounds, quadtree } from "./position.js";
import { Response, testCircleCircle } from "sat";
import { GameEvent, type GameEventMap } from "./event_map.js";

/**
 * Runs collisions for any object with the CalculateCollisions component.
 *
 * Emits positionUpdate event when object is moved by a collision.
 */
export class CollisionSystem extends System<GameEventMap> {
    constructor() {
        super([Physics, CalculateCollisions], 10);

        this.listen(GameEvent.Move, this.testForCollision);
    }

    testForCollision({ object: target }: GameEvent.Move, tries: number = 0) {
        const physics = target.get(Physics);

        const bounds = getSizedBounds(physics.position, 500, 500);

        const nearby = this.world.query([Physics], quadtree.query(bounds));

        const response = new Response();
        let retrigger = false;
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
                retrigger = true;
                physics.position.sub(response.overlapV);
                this.trigger(GameEvent.Collide, { object: target });
            }
        }
        if (retrigger && tries < 3) {
            this.testForCollision({ object: target, x: 0, y: 0 }, tries + 1);
        }
    }
}
