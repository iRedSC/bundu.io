import { Physics } from "../components/base.js";
import { Quadtree, type BasicPoint, round, clamp } from "@ioengine/lib";
import { GameObject, System } from "@ioengine/server";
import { worldPacketManager } from "../network/managers.js";
import { ServerPacket } from "@shared/packet_definitions.js";
import { GameEvent, type GameEventMap } from "./event_map.js";

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

        this.listen(GameEvent.Rotate, this.rotate, [Physics]);
        this.listen(GameEvent.Move, this.move, [Physics]);
        this.listen(GameEvent.Collide, this.insert, [Physics]);
    }

    override enter(object: GameObject) {
        const physics = Physics.get(object);
        if (!physics) return;
        quadtree.insert(object.id, physics.position);
        this.trigger(GameEvent.NewObject, { object });
    }

    override exit(object: GameObject) {
        quadtree.delete(object.id);
    }

    insert({ object }: GameEvent.Collide) {
        const physics = Physics.get(object);
        if (!physics) return;

        quadtree.insert(object.id, physics.position);

        worldPacketManager.add(ServerPacket.SetPosition, {
            id: object.id,
            x: physics.position.x,
            y: physics.position.y,
        });
    }

    move({ object, x, y }: GameEvent.Move) {
        const physics = object.get(Physics);
        physics.position.x = round(clamp(physics.position.x - x, 0, 20000));
        physics.position.y = round(clamp(physics.position.y - y, 0, 20000));
        this.insert({ object });
    }

    rotate({ object, rotation }: GameEvent.Rotate) {
        const physics = object.get(Physics);
        physics.rotation = rotation;

        worldPacketManager.add(ServerPacket.SetRotation, {
            id: object.id,
            rotation,
        });
    }
}
