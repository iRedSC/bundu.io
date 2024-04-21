import { Physics } from "../components/base.js";
import { EventCallback, System } from "../game_engine/system.js";
import { Quadtree } from "../../lib/quadtree.js";
import { GameObject } from "../game_engine/game_object.js";
import { BasicPoint } from "../game_engine/types.js";

export const quadtree = new Quadtree(
    new Map(),
    [
        { x: 0, y: 0 },
        { x: 50000, y: 50000 },
    ],
    100
);

export const getSizedBounds = (
    origin: BasicPoint,
    sizeH: number,
    sizeV: number
): [BasicPoint, BasicPoint] => [
    { x: origin.x - sizeH, y: origin.y - sizeV },
    { x: origin.x + sizeH, y: origin.y + sizeV },
];

/**
 * Position system inserts objects into the quadtree when they move.
 */
export class PositionSystem extends System {
    constructor() {
        super([Physics]);

        this.listen("move", this.insert);
        this.listen("collide", this.insert);
    }

    enter(object: GameObject) {
        const physics = Physics.get(object);
        if (!physics) {
            return;
        }
        quadtree.insert(object.id, physics.position);
        this.trigger("new_object", object.id);
    }

    exit(object: GameObject) {
        quadtree.delete(object.id);
    }

    insert: EventCallback<"move" | "collide"> = (object: GameObject) => {
        const physics = Physics.get(object);
        if (!physics) {
            return;
        }
        quadtree.insert(object.id, physics.position);
    };
}
