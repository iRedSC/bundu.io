import { createEntityConfig, entityConfigs } from "../configs/entity.js";
import {
    lerp,
    distance,
    lookToward,
    radians,
    moveToward,
} from "../../lib/transforms.js";
import Random from "../../lib/random.js";
import SAT from "sat";
import { OBJECT_CLASS, PACKET_TYPE } from "../../shared/packet_enums.js";
import { GameObject } from "../game_engine/game_object.js";
import { EntityAI, Physics, Type } from "../components/base.js";

export class Entity extends GameObject {
    constructor(physics: Physics, type: Type) {
        super();

        const config =
            entityConfigs.get(type.id) || createEntityConfig(type.id, {});
        this.add(config);
        this.add(new Physics(physics));
        this.add(new Type(type));
        this.add(
            new EntityAI({
                target: new SAT.Vector(),
                arriveTime: 0,
                travelTime: 0,
                lastPosition: new SAT.Vector(),
                lastMoveTime: 0,
            })
        );

        // this.pack[PACKET_TYPE.NEW_OBJECT] = () => {
        //     return [OBJECT_CLASS.ENTITY, [this.id]];
        // };
    }
}

// TODO: Entity AI needs to be organized better

// export class EntityAI {
//     target: SAT.Vector;
//     arriveTime: number;
//     travelTime: number;
//     _lastPos: SAT.Vector;
//     _lastMoveTime: number;
//     constructor(position: SAT.Vector) {
//         this.target = position;
//         this.arriveTime = 0;
//         this._lastMoveTime = 0;
//         this._lastPos = position;
//     }
// }

// export class Entity extends WorldObject {
//     type: EntityConfig;
//     ai: EntityAI;
//     angry: boolean;

//     constructor(
//         id: number,
//         type: number,
//         position: [number, number],
//         rotation: number
//     ) {
//         const config = entityConfigs.get(type) || new EntityConfig(0, {});
//         super(id, position, rotation, config.size);
//         this.type = config;
//         this.ai = new EntityAI(this.position);
//         this.updateTarget([], new SAT.Vector());
//         this.angry = false;
//         this.class = OBJECT_CLASS.ENTITY;
//     }

//     move(collisionObjects: WorldObject[], prey: SAT.Vector): boolean {
//         const t =
//             (Date.now() - this.ai._lastMoveTime) /
//             (this.ai.arriveTime - this.ai._lastMoveTime);
//         const tClamped = Math.max(0, Math.min(1, t));
//         this.setPosition(
//             lerp(this.ai._lastPos.x, this.ai.target.x, tClamped),
//             lerp(this.ai._lastPos.y, this.ai.target.y, tClamped)
//         );
//         if (t >= 1 + this.type.restTime + Math.random()) {
//             this.updateTarget(collisionObjects, prey);
//             return true;
//         }
//         return false;
//     }

//     private updateTarget(collisionObjects: WorldObject[], prey: SAT.Vector) {
//         let success = false;
//         let range = Math.max(this.type.wanderRange, 0);
//         let targetCalc = moveToward(this.position, prey, range);
//         // let target = new SAT.Vector(targetCalc.x, targetCalc.y);
//         let target = new SAT.Vector(
//             this.position.x + Random.integer(-range, range),

//             this.position.y + Random.integer(-range, range)
//         );
//         let tries = 0;
//         while (tries < 20 && success !== true) {
//             const hit = testForIntersection(
//                 this.position,
//                 target,
//                 collisionObjects
//             );

//             if (hit.length > 0) {
//                 range /= 2;
//                 let targetCalc = moveToward(
//                     this.position,
//                     prey,
//                     Math.floor(range)
//                 );
//                 target = new SAT.Vector(targetCalc.x, targetCalc.y);
//                 // newTarget = this.position.clone();
//             } else {
//                 success = true;
//             }
//             tries++;
//         }
//         this.ai.target = target;
//         this.ai._lastPos = this.position.clone();
//         this.ai._lastMoveTime = Date.now();

//         this.ai.arriveTime = Date.now() + this.moveTime;
//         this.rotation = lookToward(this.ai._lastPos, this.ai.target);
//     }

//     get moveTime() {
//         return distance(this.position, this.ai.target) / (this.type.speed / 15);
//     }

//     pack(type: PACKET_TYPE): any[] {
//         switch (type) {
//             case PACKET_TYPE.MOVE_OBJECT:
//                 return [
//                     this.id,
//                     this.moveTime,
//                     this.ai.target.x,
//                     this.ai.target.y,
//                 ];
//             case PACKET_TYPE.ROTATE_OBJECT:
//                 return [this.id, this.rotation];
//             case PACKET_TYPE.NEW_OBJECT:
//                 return [
//                     this.id,
//                     this.position.x,
//                     this.position.y,
//                     this.rotation,
//                     this.type.size,
//                     this.type.id,
//                     this.angry,
//                 ];
//         }
//         return [];
//     }
// }

// export function testForIntersection(
//     start: SAT.Vector,
//     end: SAT.Vector,
//     collisionTest: WorldObject[]
// ) {
//     const hitObjects: WorldObject[] = [];
//     const line = new SAT.Polygon(start, [
//         new SAT.Vector(0, 0),
//         end.clone().sub(start),
//     ]);

//     for (const other of collisionTest) {
//         const overlap = SAT.testPolygonCircle(line, other.collider);
//         if (overlap) {
//             hitObjects.push(other);
//         }
//     }
//     return hitObjects;
// }
