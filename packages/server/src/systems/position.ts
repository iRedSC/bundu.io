import { WORLD_BOUNDS, worldToDeci, worldToTile } from "@bundu/shared/tiles";
import type { BasicPoint } from "@bundu/shared";
import { Physics, TileEntity } from "../components/base.js";
import { PlayerData } from "../components/player.js";
import { type GameObject, System, type World } from "../engine";
import { ServerPacket } from "@bundu/shared/packet_definitions.js";
import { GameEvent, type GameEventMap } from "./event_map.js";

/** Neighborhood half-size for spatial queries (attack / collision). */
export const SPATIAL_QUERY_PADDING = 500;

export { WORLD_BOUNDS };

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
 *
 * Sim stays full-precision; only the wire packet is quantized.
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

        const tile = TileEntity.get(object);
        if (tile) {
            const ok = this.world.context.occupancy.occupy(
                object.id,
                tile.occupied,
                tile.layer
            );
            if (!ok) {
                // Placement should have validated; drop if racing a free tile.
                object.active = false;
                return;
            }
        }

        // New players wait for ClientReady before spatial index / peer announce.
        if (PlayerData.get(object)?.pendingSpawn) return;

        this.world.context.quadtree.insert(object.id, physics.position);
        this.trigger(GameEvent.NewObject, { object });
    }

    override exit(object: GameObject) {
        this.world.context.occupancy.release(object.id);
        this.world.context.quadtree.delete(object.id);
    }

    /** Final quadtree + network write after move intent and collision settle. */
    publish({ object }: GameEvent.Collide) {
        const physics = Physics.get(object);
        if (!physics) return;

        this.world.context.quadtree.insert(object.id, physics.position);

        this.world.context.worldPacketManager.set(ServerPacket.SetPosition, {
            id: object.id,
            x: worldToDeci(physics.position.x),
            y: worldToDeci(physics.position.y),
        });
    }

    move({ object, x, y }: GameEvent.Move) {
        const physics = object.get(Physics);
        physics.position.x = Math.min(
            Math.max(physics.position.x - x, 0),
            WORLD_BOUNDS
        );
        physics.position.y = Math.min(
            Math.max(physics.position.y - y, 0),
            WORLD_BOUNDS
        );
    }

    rotate({ object, rotation }: GameEvent.Rotate) {
        const physics = object.get(Physics);
        physics.rotation = rotation;

        this.world.context.worldPacketManager.set(ServerPacket.SetRotation, {
            id: object.id,
            rotation,
        });
    }
}

export function tilesOverlappingCircle(
    pos: BasicPoint,
    radius: number
): { minX: number; minY: number; maxX: number; maxY: number } {
    return {
        minX: worldToTile(pos.x - radius),
        minY: worldToTile(pos.y - radius),
        maxX: worldToTile(pos.x + radius),
        maxY: worldToTile(pos.y + radius),
    };
}
