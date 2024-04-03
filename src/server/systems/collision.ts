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

        this.listen("moved", this.collide.bind(this));
    }

    collide(objects: IterableIterator<GameObject>) {
        for (const object of objects) {
            const physics = Physics.get(object).data;

            const bounds: [BasicPoint, BasicPoint] = [
                { x: physics.position.x - 500, y: physics.position.y - 500 },
                { x: physics.position.x + 500, y: physics.position.y + 500 },
            ];

            const nearby = this.world.query(
                [Physics.id],
                quadtree.query(bounds)
            );

            const response = new SAT.Response();
            for (const other of nearby) {
                if (other.id === object.id || PlayerData.get(other)) {
                    continue;
                }
                const otherPhysics = Physics.get(other).data;
                const collided = SAT.testCircleCircle(
                    physics.collider,
                    otherPhysics.collider,
                    response
                );
                if (collided) {
                    physics.position.sub(response.overlapV);
                    this.trigger("collided", object.id);
                }
            }
        }
    }
}
