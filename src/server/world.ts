// import { Resource } from "./game_objects/resource.js";
// import { Player } from "./game_objects/player.js";
// import { Entity, testForIntersection } from "./game_objects/entity.js";
// import { Quadtree } from "../lib/quadtree.js";
// import { Range, rangeFromPoint } from "../lib/range.js";
// import SAT from "sat";
// import { WorldObject } from "./game_objects/world_object.js";
// import { Ground } from "./game_objects/ground.js";
// import { ACTION, ClientPacketSchema, PACKET_TYPE } from "../shared/enums.js";
// import { degrees, moveInDirection, moveToward } from "../lib/transforms.js";
// import { UpdateHandler } from "./game_objects/update_handler.js";
// import Logger from "js-logger";
// import { send } from "./send.js";

// const logger = Logger.get("World");

// // Holds all the actual world items as different quadtrees
// export class OldWorld {
//     nextId: number;
//     mapBounds: Range;
//     resources: Quadtree<Resource>;
//     players: Quadtree<Player>;
//     entities: Quadtree<Entity>;
//     ground: Ground[];

//     constructor() {
//         this.nextId = 0;
//         this.mapBounds = new Range({ x: 0, y: 0 }, { x: 20000, y: 20000 });
//         this.resources = new Quadtree(
//             new Map<number, Resource>(),
//             this.mapBounds,
//             10
//         );
//         this.entities = new Quadtree(
//             new Map<number, Entity>(),
//             this.mapBounds,
//             10
//         );
//         this.players = new Quadtree(
//             new Map<number, Player>(),
//             this.mapBounds,
//             10
//         );
//         this.ground = [];
//     }

//     updatePlayerViews() {
//         const move: any[] = [PACKET_TYPE.MOVE_OBJECT];
//         const rotate: any[] = [PACKET_TYPE.ROTATE_OBJECT];
//         function loop(player: Player, objects: Iterable<WorldObject>) {
//             for (const object of objects) {
//                 const isNew = player.visibleObjects.set(object.id, object);
//                 if (isNew) {
//                     move.push(...object.pack(PACKET_TYPE.MOVE_OBJECT));
//                     rotate.push(...object.pack(PACKET_TYPE.ROTATE_OBJECT));
//                 }
//             }
//         }
//         for (const player of this.players.values()) {
//             player.visibleObjects.clear();
//             const range = rangeFromPoint(player.position, 800);
//             const resources = this.resources.query(range);
//             const players = this.players.query(range);
//             const entities = this.entities.query(range);
//             loop(player, resources.values());
//             loop(player, players.values());
//             loop(player, entities.values());
//             send(player.socket, move);
//             send(player.socket, rotate);
//         }
//     }

//     requestObjects(data: ClientPacketSchema.requestObjects, id: number) {
//         const packet: any[] = [PACKET_TYPE.NEW_OBJECT];
//         const objects = data[0];
//         const player = this.players.get(id);
//         if (!player) {
//             return;
//         }
//         for (const objId of objects) {
//             const object = this.getAllObjects().get(objId);
//             if (object) {
//                 packet.push(object.class, object.pack(PACKET_TYPE.NEW_OBJECT));
//             }
//         }
//         send(player.socket, packet);
//     }

//     tick(updateHandler: UpdateHandler) {
//         const player = this.players.get(1);
//         for (let [id, entity] of this.entities.objects.entries()) {
//             const detectionRange = rangeFromPoint(entity.position, 800);
//             const collisionTest = this.resources.query(detectionRange);

//             const moved = entity.move(
//                 Array.from(collisionTest.values()),
//                 player?.position || new SAT.Vector()
//             );
//             if (moved) {
//                 updateHandler.add(
//                     [entity],
//                     [PACKET_TYPE.ROTATE_OBJECT, PACKET_TYPE.MOVE_OBJECT]
//                 );
//             }
//             this.entities.insert(entity);
//         }
//         for (let [id, player] of this.players.objects.entries()) {
//             const moved = player.move();
//             const movedObjects = [];
//             const collided = collideCircle(player, this, movedObjects);
//             if (moved || collided) {
//                 updateHandler.add(
//                     [player, ...movedObjects],
//                     [PACKET_TYPE.MOVE_OBJECT]
//                 );
//             }
//         }
//     }

//     attack(player: Player) {
//         const detectionRange = rangeFromPoint(player.position, 100);
//         const resources = this.resources.query(detectionRange);
//         const _hitRange = moveInDirection(
//             player.position,
//             player.rotation + degrees(90),
//             50
//         );
//         const hitRange = new SAT.Vector(_hitRange.x, _hitRange.y);

//         const hit = testForIntersection(
//             player.position,
//             hitRange,
//             Array.from(resources.values())
//         );

//         const packet: any[] = [PACKET_TYPE.ACTION];
//         for (let object of hit) {
//             packet.push(object.id, ACTION.HURT);
//         }
//         for (let player of this.players.objects.values()) {
//             send(player.socket, packet);
//         }
//     }
// }
// function collide(
//     object: WorldObject,
//     others: Iterable<WorldObject>,
//     updateList: WorldObject[],
//     worldList: Quadtree<WorldObject>
// ) {
//     let success = false;
//     for (const other of others) {
//         const response = new SAT.Response();
//         const overlap = SAT.testCircleCircle(
//             object.collider,
//             other.collider,
//             response
//         );
//         if (overlap) {
//             const responseV = response.overlapV.scale(0.5, 0.5);
//             object.collider.pos.sub(responseV);
//             other.collider.pos.add(responseV);
//             updateList.push(other);
//             worldList.insert(other);
//             success = true;
//         }
//     }
//     return success;
// }

// function collideCircle(
//     object: WorldObject,
//     world: World,
//     updateList: WorldObject[]
// ) {
//     const detectionRange = rangeFromPoint(object.position, 500);
//     const resources = world.resources.query(detectionRange);
//     const entities = world.entities.query(detectionRange);
//     const rcol = collide(
//         object,
//         resources.values(),
//         updateList,
//         world.resources
//     );
//     const ecol = collide(object, entities.values(), updateList, world.entities);
//     if (rcol || ecol) {
//         return true;
//     }
//     return false;
// }
