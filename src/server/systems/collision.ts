import { BasicPoint } from "../../lib/types.js";
import { CalculateCollisions, Physics } from "../components/base.js";
import { PlayerData } from "../components/player.js";
import { GameObject } from "../game_engine/game_object.js";
import { System } from "../game_engine/system.js";
import { quadtree } from "./position.js";
import SAT from "sat";

/**
 * Runs collisions for any object with the CalculateCollisions component.
 *
 * Emits positionUpdate event when object is moved by a collision.
 */
export class CollisionSystem extends System {
    constructor() {
        super([Physics, CalculateCollisions], 10);

        this.listen("move", this.collide.bind(this));
    }

    collide(object: GameObject, tries: number = 0) {
        const physics = Physics.get(object).data;

        const bounds: [BasicPoint, BasicPoint] = [
            { x: physics.position.x - 500, y: physics.position.y - 500 },
            { x: physics.position.x + 500, y: physics.position.y + 500 },
        ];

        const nearby = this.world.query([Physics.id], quadtree.query(bounds));

        const response = new SAT.Response();
        let retrigger = false;
        for (const other of nearby) {
            if (other.id === object.id || !Physics.get(other).data.solid) {
                continue;
            }
            const otherPhysics = Physics.get(other).data;
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
            this.collide(object, tries + 1);
        }
    }
}
