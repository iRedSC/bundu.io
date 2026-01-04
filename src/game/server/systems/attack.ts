import { radians, moveInDirection, type BasicPoint } from "@ioengine/lib";
import { Physics } from "../components/base.js";
import { GameObject } from "../../../ioengine/server/game_engine/game_object.js";
import { System } from "@ioengine/server";
import { quadtree } from "./position.js";
import SAT from "sat";
import {
    playerPacketManager,
    worldPacketManager,
} from "../network/managers.js";
import { ServerPacket } from "@shared/packet_definitions.js";
import { GameEvent, type GameEventMap } from "./event_map.js";

function packPolygon(polygon: SAT.Polygon): {
    startX: number;
    startY: number;
    points: [x: number, y: number][];
} {
    return {
        startX: polygon.pos.x,
        startY: polygon.pos.y,
        points: polygon.points.map((vec) => [vec.x, vec.y]),
    };
}

function pointToVec(point: BasicPoint) {
    return new SAT.Vector(point.x, point.y);
}

// Yes, I used ChatGPT for this one, don't hate on me
export function attackBox(
    start: SAT.Vector,
    direction: number,
    length: number,
    width: number
): SAT.Polygon {
    // Calculate end point based on direction and length
    const end = moveInDirection({ x: 0, y: 0 }, direction, length);

    // Calculate the perpendicular angle to the direction
    const perpendicularAngle = direction + Math.PI / 2;

    // Calculate points for the polygon
    const halfWidth = width / 2;
    const p1 = pointToVec(
        moveInDirection({ x: 0, y: 0 }, perpendicularAngle, halfWidth)
    );
    const p2 = pointToVec(moveInDirection(end, perpendicularAngle, halfWidth));
    const p3 = pointToVec(
        moveInDirection(end, perpendicularAngle + Math.PI, halfWidth)
    );
    const p4 = pointToVec(
        moveInDirection({ x: 0, y: 0 }, perpendicularAngle + Math.PI, halfWidth)
    );

    // Construct and return the polygon
    return new SAT.Polygon(start.clone(), [p4, p3, p2, p1, new SAT.Vector()]);
}

export function testForIntersection(
    polygon: SAT.Polygon,
    collisionTest: GameObject[]
) {
    const hitObjects: Map<number, GameObject> = new Map();

    for (const other of collisionTest) {
        const physics = other.get(Physics);
        if (!physics) {
            continue;
        }
        const overlap = SAT.testPolygonCircle(polygon, physics.collider);
        if (overlap) {
            hitObjects.set(other.id, other);
        }
    }
    return hitObjects;
}

export class AttackSystem extends System<GameEventMap> {
    constructor() {
        super([Physics]);

        this.listen(GameEvent.Attack, this.attack);
    }

    attack({ object: source, damage, weapon, hitbox }: GameEvent.Attack) {
        const physics = Physics.get(source);
        if (!physics) return;

        const bounds: [BasicPoint, BasicPoint] = [
            { x: physics.position.x - 500, y: physics.position.y - 500 },
            { x: physics.position.x + 500, y: physics.position.y + 500 },
        ];

        const nearby = this.world.query([Physics], quadtree.query(bounds));

        let start = 0;
        let length = 5;
        let width = 5;
        if (hitbox) {
            start = hitbox.start;
            length = hitbox.length;
            width = hitbox.width;
        }

        const hitRange = attackBox(
            pointToVec(
                moveInDirection(
                    physics.position,
                    physics.rotation + radians(90),
                    start
                )
            ),
            physics.rotation + radians(90),
            length,
            width
        );

        worldPacketManager.add(ServerPacket.AttackEvent, { id: source.id });
        playerPacketManager.set(
            source.id,
            ServerPacket.DebugDrawPolygon,
            packPolygon(hitRange)
        );

        const hits = testForIntersection(hitRange, nearby);
        hits.delete(source.id);
        for (const object of hits.values()) {
            this.trigger(GameEvent.Hurt, {
                object,
                damage,
                weapon,
            });
        }
    }
}
