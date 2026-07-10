import { Physics } from "../components/base.js";
import { type BasicPoint, round, clamp } from "@bundu/shared";
import { GameObject, System, type World } from "../engine";
import { ServerPacket } from "@bundu/shared/packet_definitions.js";
import { GameEvent, type GameEventMap } from "./event_map.js";

/** World extent from origin (0,0) to (WORLD_BOUNDS, WORLD_BOUNDS). */
export const WORLD_BOUNDS = 20000;

/** Neighborhood half-size for spatial queries (attack / collision). */
export const SPATIAL_QUERY_PADDING = 500;

export const getSizedBounds = (
    origin: BasicPoint,
    sizeH: number,
    sizeV: number
): [BasicPoint, BasicPoint] => [
    { x: origin.x - sizeH, y: origin.y - sizeV },
    { x: origin.x + sizeH, y: origin.y + sizeV },
];

/**
 * Position owns Move intent (apply delta) and the single spatial/net write.
 * Collision resolves after Move, then emits Collide once for that write.
 */
export class PositionSystem extends System<GameEventMap> {
    constructor(world: World) {
        super(world, [Physics]);

        this.listen(GameEvent.Rotate, this.rotate, [Physics]);
        this.listen(GameEvent.Move, this.move, [Physics]);
        this.listen(GameEvent.Collide, this.publish, [Physics]);
    }

    override enter(object: GameObject) {
        const physics = Physics.get(object);
        if (!physics) return;
        this.world.context.quadtree.insert(object.id, physics.position);
        this.trigger(GameEvent.NewObject, { object });
    }

    override exit(object: GameObject) {
        this.world.context.quadtree.delete(object.id);
    }

    /** Final quadtree + network write after move intent and collision settle. */
    publish({ object }: GameEvent.Collide) {
        const physics = Physics.get(object);
        if (!physics) return;

        this.world.context.quadtree.insert(object.id, physics.position);

        this.world.context.worldPacketManager.add(ServerPacket.SetPosition, {
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
        // CollisionSystem listens to Move next and emits Collide once when settled.
    }

    rotate({ object, rotation }: GameEvent.Rotate) {
        const physics = object.get(Physics);
        physics.rotation = rotation;

        this.world.context.worldPacketManager.add(ServerPacket.SetRotation, {
            id: object.id,
            rotation,
        });
    }
}
