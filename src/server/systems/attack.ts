import { radians, moveInDirection } from "../../lib/transforms.js";
import { BasicPoint } from "../../lib/types.js";
import { ACTION, PACKET_TYPE } from "../../shared/enums.js";
import { Physics } from "../components/base.js";
import { AttackData } from "../components/combat.js";
import { PlayerData } from "../components/player.js";
import { GameObject } from "../game_engine/game_object.js";
import { System } from "../game_engine/system.js";
import { send } from "../send.js";
import { quadtree } from "./position.js";
import SAT from "sat";

function packPolygon(polygon: SAT.Polygon) {
    return [
        PACKET_TYPE.DRAW_POLYGON,
        [
            polygon.pos.x,
            polygon.pos.y,
            polygon.points.map((vec) => [vec.x, vec.y]),
        ],
    ];
}

function pointToVec(point: BasicPoint) {
    return new SAT.Vector(point.x, point.y);
}

export function createPolygon(
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
    collisionTest: Set<GameObject>
) {
    const hitObjects: Set<GameObject> = new Set();

    for (const other of collisionTest) {
        const physics = Physics.get(other)?.data;
        if (!physics) {
            continue;
        }
        const overlap = SAT.testPolygonCircle(polygon, physics.collider);
        if (overlap) {
            hitObjects.add(other);
        }
    }
    return hitObjects;
}

export class AttackSystem extends System {
    constructor() {
        super([AttackData, Physics]);

        this.listen("attack", this.attack.bind(this));
    }

    attack(objects: IterableIterator<GameObject>) {
        for (const object of objects) {
            const data = AttackData.get(object)?.data;
            const physics = Physics.get(object)?.data;
            if (!(data && physics)) {
                continue;
            }

            const bounds: [BasicPoint, BasicPoint] = [
                { x: physics.position.x - 500, y: physics.position.y - 500 },
                { x: physics.position.x + 500, y: physics.position.y + 500 },
            ];

            const nearby = this.world.query(
                [Physics.id],
                quadtree.query(bounds)
            );

            const hitRange = createPolygon(
                pointToVec(
                    moveInDirection(
                        physics.position,
                        physics.rotation + radians(90),
                        50
                    )
                ),
                physics.rotation + radians(90),
                50,
                50
            );

            const hits = testForIntersection(hitRange, nearby);

            const packet: any[] = [PACKET_TYPE.ACTION];
            for (let hit of hits) {
                if (hit.id === object.id) {
                    continue;
                }
                packet.push([hit.id, ACTION.HURT, false]);
            }
            // if (packet.length <= 1) {
            //     continue;
            // }
            const players = this.world.query([PlayerData.id]);
            for (let player of players.values()) {
                const data = PlayerData.get(player)?.data;
                send(data?.socket, packPolygon(hitRange));
                if (data?.visibleObjects.has(object.id) && packet.length > 1) {
                    console.log(packet);
                    send(data?.socket, packet);
                }
            }
        }
    }
}
