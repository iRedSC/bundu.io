import { degrees, moveInDirection } from "../../lib/transforms.js";
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

export function testForIntersection(
    start: SAT.Vector,
    end: SAT.Vector,
    collisionTest: Set<GameObject>
) {
    const hitObjects: Set<GameObject> = new Set();
    const line = new SAT.Polygon(start, [
        new SAT.Vector(0, 0),
        end.clone().sub(start),
    ]);

    for (const other of collisionTest) {
        const physics = Physics.get(other)?.data;
        if (!physics) {
            continue;
        }
        const overlap = SAT.testPolygonCircle(line, physics.collider);
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

            const _hitRange = moveInDirection(
                physics.position,
                physics.rotation + degrees(90),
                50
            );
            const hitRange = new SAT.Vector(_hitRange.x, _hitRange.y);

            const hits = testForIntersection(
                physics.position,
                hitRange,
                nearby
            );

            const packet: any[] = [PACKET_TYPE.ACTION];
            for (let hit of hits) {
                if (hit.id === object.id) {
                    continue;
                }
                packet.push([hit.id, ACTION.HURT, false]);
            }
            if (packet.length <= 1) {
                continue;
            }
            const players = this.world.query([PlayerData.id]);
            for (let player of players.values()) {
                const data = PlayerData.get(player)?.data;
                if (data?.visibleObjects.has(object.id)) {
                    console.log(packet);
                    send(data?.socket, packet);
                }
            }
        }
    }
}
