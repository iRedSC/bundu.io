import { Physics } from "../components/base.js";
import { System } from "../game_engine/system.js";
import { Quadtree } from "../../lib/quadtree.js";
import { GameObject } from "../game_engine/game_object.js";

export const quadtree = new Quadtree(
    new Map(),
    [
        { x: 0, y: 0 },
        { x: 10000, y: 10000 },
    ],
    10
);

export class PositionSystem extends System {
    constructor() {
        super([Physics]);

        this.listen("moved", this.insert);
        this.listen("collided", this.insert);
    }

    insert(objects: IterableIterator<GameObject>) {
        for (const object of objects) {
            const physics = Physics.get(object)?.data;
            if (!physics) {
                continue;
            }
            quadtree.insert(object.id, physics.position);
        }
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
