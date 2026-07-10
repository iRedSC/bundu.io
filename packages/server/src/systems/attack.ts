import { radians, moveInDirection, type BasicPoint } from "@bundu/shared";
import { Physics } from "../components/base.js";
import { GameObject, System, type World } from "../engine";
import { quadtree } from "./position.js";
import SAT from "sat";
import { worldPacketManager } from "../network/managers.js";
import { ServerPacket } from "@bundu/shared/packet_definitions.js";
import { GameEvent, type GameEventMap } from "./event_map.js";

function pointToVec(point: BasicPoint) {
    return new SAT.Vector(point.x, point.y);
}

export function attackBox(
    start: SAT.Vector,
    direction: number,
    length: number,
    width: number
): SAT.Polygon {
    const end = moveInDirection({ x: 0, y: 0 }, direction, length);
    const perpendicularAngle = direction + Math.PI / 2;
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
    return new SAT.Polygon(start.clone(), [p4, p3, p2, p1, new SAT.Vector()]);
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
