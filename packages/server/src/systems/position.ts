import { Physics } from "../components/base.js";
import { type BasicPoint, round, clamp } from "@bundu/shared";
import { Quadtree } from "../engine/quadtree.js";
import { GameObject, System, type World } from "../engine";
import { worldPacketManager } from "../network/managers.js";
import { ServerPacket } from "@bundu/shared/packet_definitions.js";
import { GameEvent, type GameEventMap } from "./event_map.js";

/** World extent from origin (0,0) to (WORLD_BOUNDS, WORLD_BOUNDS). */
export const WORLD_BOUNDS = 20000;

/** Neighborhood half-size for spatial queries (attack / collision). */
export const SPATIAL_QUERY_PADDING = 500;

export const quadtree = new Quadtree(
    new Map(),
    [
        { x: 0, y: 0 },
        { x: WORLD_BOUNDS, y: WORLD_BOUNDS },
    ],
    5
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
    constructor(world: World) {
        super(world, [Physics]);

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
        physics.position.x = round(
            clamp(physics.position.x - x, 0, WORLD_BOUNDS)
        );
        physics.position.y = round(
            clamp(physics.position.y - y, 0, WORLD_BOUNDS)
        );
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
