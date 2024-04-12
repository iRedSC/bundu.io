import { Physics } from "../components/base.js";
import { System } from "../game_engine/system.js";
import { Quadtree } from "../../lib/quadtree.js";
import { GameObject } from "../game_engine/game_object.js";

export const quadtree = new Quadtree(
    new Map(),
    [
        { x: 0, y: 0 },
        { x: 20000, y: 20000 },
    ],
    10
);

/**
 * Position system inserts objects into the quadtree when they move.
 */
export class PositionSystem extends System {
    constructor() {
        super([Physics]);

        this.listen("moved", this.insert);
        this.listen("collided", this.insert);
    }

    insert(object: GameObject) {
        const physics = Physics.get(object)?.data;
        if (!physics) {
            return;
        }
        quadtree.insert(object.id, physics.position);
    }

    enter(object: GameObject) {
        const physics = Physics.get(object)?.data;
        if (!physics) {
            return;
        }
        quadtree.insert(object.id, physics.position);
    }

    exit(object: GameObject) {
        quadtree.delete(object.id);
    }
}
