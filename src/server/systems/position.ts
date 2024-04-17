import { Physics } from "../components/base.js";
import { System } from "../game_engine/system.js";
import { Quadtree } from "../../lib/quadtree.js";
import { GameObject } from "../game_engine/game_object.js";

export const quadtree = new Quadtree(
    new Map(),
    [
        { x: 0, y: 0 },
        { x: 50000, y: 50000 },
    ],
    10
);

/**
 * Position system inserts objects into the quadtree when they move.
 */
export class PositionSystem extends System {
    constructor() {
        super([Physics]);

        this.listen("move", this.insert);
        this.listen("collide", this.insert);
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
