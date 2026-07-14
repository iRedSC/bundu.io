import {
    attackBoxPoints,
    attackFacingRadians,
    moveInDirection,
    radians,
    type BasicPoint,
} from "@bundu/shared";
import { Door, Physics, Rotting, TileEntity } from "../components/base.js";
import { getNumericId } from "@bundu/shared/id_map.js";
import { type GameObject, System, type World } from "../engine";
import { getSizedBounds, SPATIAL_QUERY_PADDING } from "./position.js";
import SAT from "sat";
import { ServerPacket } from "@bundu/shared/packet_definitions.js";
import { GameEvent, type GameEventMap } from "./event_map.js";

const DIAMOND_SWORD_ID = getNumericId("diamond_sword");

function pointToVec(point: BasicPoint) {
    return new SAT.Vector(point.x, point.y);
}

export function attackBox(
    start: SAT.Vector,
    direction: number,
    length: number,
    width: number
): SAT.Polygon {
    const points = attackBoxPoints(
        { x: start.x, y: start.y },
        direction,
        length,
        width
    );
    return new SAT.Polygon(
        new SAT.Vector(),
        points.map((p) => new SAT.Vector(p.x, p.y))
    );
}

export function testForIntersection(
    polygon: SAT.Polygon,
    collisionTest: GameObject[]
) {
    const hitObjects: Map<number, GameObject> = new Map();

    for (const other of collisionTest) {
        const physics = other.get(Physics);
        if (!physics) continue;
        if (SAT.testPolygonCircle(polygon, physics.collider)) {
            hitObjects.set(other.id, other);
        }
    }
    return hitObjects;
}

export class AttackSystem extends System<GameEventMap> {
    constructor(world: World) {
        super(world, [Physics]);
        this.listen(GameEvent.Attack, this.attack);
    }

    attack({ object: source, damage, weapon, hitbox }: GameEvent.Attack) {
        const physics = Physics.get(source);
        if (!physics) return;

        const bounds = getSizedBounds(
            physics.position,
            SPATIAL_QUERY_PADDING,
            SPATIAL_QUERY_PADDING
        );

        const nearby = this.world.query(
            [Physics],
            this.world.context.quadtree.query(bounds)
        );

        let start = 0;
        let length = 5;
        let width = 5;
        if (hitbox) {
            start = hitbox.start;
            length = hitbox.length;
            width = hitbox.width;
        }

        // physics.rotation is degrees (client sends degrees); SAT/math use radians.
        const facing = attackFacingRadians(radians(physics.rotation));
        const origin = moveInDirection(physics.position, facing, start);
        const hitRange = attackBox(
            pointToVec(origin),
            facing,
            length,
            width
        );

        this.world.context.worldPacketManager.emit(ServerPacket.AttackEvent, {
            id: source.id,
            start,
            length,
            width,
        });

        const hits = testForIntersection(hitRange, nearby);
        hits.delete(source.id);
        for (const object of hits.values()) {
            this.world.context.worldPacketManager.emit(ServerPacket.HitEvent, {
                id: object.id,
                angle: facing,
            });
            if (Door.get(object)) {
                this.trigger(GameEvent.ToggleDoor, { object });
                continue;
            }
            this.trigger(GameEvent.Hurt, {
                object,
                source,
                damage,
                weapon,
            });
            this.claimRottingStructure(source, object, weapon);
        }
    }

    private claimRottingStructure(
        player: GameObject,
        target: GameObject,
        weapon?: number
    ): void {
        if (weapon !== DIAMOND_SWORD_ID || !Rotting.get(target)) return;
        const tile = TileEntity.get(target);
        if (!tile) return;

        target.remove(Rotting);
        tile.ownerId = player.id;
        this.world.context.worldPacketManager.emit(ServerPacket.SetObjectState, {
            id: target.id,
            state: "rotting",
            value: false,
        });
    }
}
