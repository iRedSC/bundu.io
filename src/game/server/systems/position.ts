import { Physics } from "../components/base.js";
import { Quadtree, type BasicPoint, round, clamp } from "@ioengine/lib";
import { GameObject, System } from "@ioengine/server";
import { worldPacketManager } from "../network/managers.js";
import { ServerPacket } from "@shared/packet_definitions.js";
import type { EventCallback, GameEventMap } from "./event_map.js";

export const quadtree = new Quadtree(
    new Map(),
    [
        { x: 0, y: 0 },
        { x: 500000, y: 500000 },
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
export class PositionSystem extends System<GameEventMap> {
    constructor() {
        super([Physics]);

        this.listen("rotate", this.rotate, [Physics]);
        this.listen("move", this.move, [Physics]);
        this.listen("collide", this.insert, [Physics]);
    }

    override enter(object: GameObject) {
        const physics = Physics.get(object);
        if (!physics) return;
        quadtree.insert(object.id, physics.position);
        this.trigger("new_object", object.id);
    }

    override exit(object: GameObject) {
        quadtree.delete(object.id);
    }

    insert: EventCallback<"collide"> = (object: GameObject) => {
        const physics = Physics.get(object);
        if (!physics) return;

        quadtree.insert(object.id, physics.position);

        worldPacketManager.add(ServerPacket.SetPosition, {
            id: object.id,
            x: physics.position.x,
            y: physics.position.y,
        });
    };

    move: EventCallback<"move"> = (object: GameObject, { x, y }) => {
        const physics = object.get(Physics);
        physics.position.x = round(clamp(physics.position.x - x, 0, 20000));
        physics.position.y = round(clamp(physics.position.y - y, 0, 20000));
        this.insert(object, undefined);
    };

    rotate: EventCallback<"rotate"> = (object: GameObject, { rotation }) => {
        const physics = object.get(Physics);
        physics.rotation = rotation;

        worldPacketManager.add(ServerPacket.SetRotation, {
            id: object.id,
            rotation,
        });
    };
}
