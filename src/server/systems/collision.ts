import { BasicPoint } from "../../lib/types.js";
import { CalculateCollisions, Physics } from "../components/base.js";
import { GameObject } from "../game_engine/game_object.js";
import { EventCallback, System } from "../game_engine/system.js";
import { getSizedBounds, quadtree } from "./position.js";
import SAT from "sat";

/**
 * Runs collisions for any object with the CalculateCollisions component.
 *
 * Emits positionUpdate event when object is moved by a collision.
 */
export class CollisionSystem extends System {
    constructor() {
        super([Physics, CalculateCollisions], 10);

        this.listen("move", this.collide);
    }

    collide: EventCallback<"move"> = (
        object: GameObject,
        _,
        tries: number = 0
    ) => {
        const physics = object.get(Physics);

        const bounds = getSizedBounds(physics.position, 500, 500);

        const nearby = this.world.query([Physics], quadtree.query(bounds));

        const response = new SAT.Response();
        let retrigger = false;
        for (const other of nearby) {
            if (other.id === object.id || !Physics.get(other).solid) {
                continue;
            }
            const otherPhysics = Physics.get(other);
            const collided = SAT.testCircleCircle(
                physics.collider,
                otherPhysics.collider,
                response
            );
            if (collided) {
                retrigger = true;
                physics.position.sub(response.overlapV);
                this.trigger("collide", object.id);
            }
        }
        if (retrigger && tries < 3) {
            this.collide(object, undefined, tries + 1);
        }
    };
}
