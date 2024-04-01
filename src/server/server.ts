// import { Player } from "./game_objects/player.js";
// import { GameWS } from "./network/websockets.js";
// import { World } from "./world.js";
// import {
//     CLIENT_ACTION,
//     ClientPacketSchema,
//     OBJECT_CLASS,
//     PACKET_TYPE,
// } from "../shared/enums.js";
// import { PacketPipeline } from "../shared/unpack.js";
// import { UpdateHandler } from "./game_objects/update_handler.js";
// import { send } from "./send.js";

// function sendPacket(players: Iterable<Player>, packets: any[]) {
//     for (let player of players) {
//         for (let packet of packets) {
//             send(player.socket, packet);
//         }
//     }
// }
// // This is where most of the player handling logic happens
// // creating, deleting, etc.
// export class BunduServer {
//     world: World;
//     players: Map<number, Player>;
//     pipeline: PacketPipeline;
//     updateHandler: UpdateHandler;
//     constructor(world: World, pipeline: PacketPipeline) {
//         this.pipeline = pipeline;
//         this.world = world;
//         this.players = new Map();
//         this.updateHandler = new UpdateHandler();
//     }

//     createPlayer(socket: GameWS) {
//         const player = new Player(0, socket, [10_000, 10_000], 0, "");
//         this.world.nextId++;
//         player.id = this.world.nextId;
//         player.name = `Player #${player.id}`;

//         const packet: any[] = [PACKET_TYPE.NEW_OBJECT];
//         for (const player of this.players.values()) {
//             packet.push(
//                 OBJECT_CLASS.PLAYER,
//                 player.pack(PACKET_TYPE.NEW_OBJECT)
//             );
//         }
//         if (packet.length > 1) {
//             send(player.socket, packet);
//         }

//         this.world.players.insert(player);
//         this.players.set(player.id, player);
//         for (let client of this.players.values()) {
//             send(client.socket, [
//                 PACKET_TYPE.NEW_OBJECT,
//                 OBJECT_CLASS.PLAYER,
//                 player.pack(PACKET_TYPE.NEW_OBJECT),
//             ]);
//         }
//         send(player.socket, [PACKET_TYPE.STARTING_INFO, player.id]);
//         return player.id;
//     }

//     deletePlayer(id: number) {
//         this.players.delete(id);
//         this.world.players.delete(id);
//         sendPacket(this.players.values(), [[PACKET_TYPE.DELETE_OBJECT, id]]);
//     }

//     moveUpdate(data: ClientPacketSchema.moveUpdate, id: number) {
//         const player = this.players.get(id);
//         if (!player) {
//             return;
//         }
//         player.moveDir = [data[0], data[1]];
//     }

//     rotatePlayer(data: ClientPacketSchema.rotate, id: number) {
//         const player = this.players.get(id);
//         if (!player) {
//             return;
//         }
//         player.rotation = data[0];
//         this.updateHandler.add([player], [PACKET_TYPE.ROTATE_OBJECT]);
//     }

//     requestObjects(data: ClientPacketSchema.requestObjects, id: number) {
//         const player = this.players.get(id);
//         if (!player) {
//             return;
//         }
//         const packet = this.world.requestObjects(data, id);
//     }

//     playerAction(data: ClientPacketSchema.action, id: number) {
//         const player = this.players.get(id);
//         if (player) {
//             let action = 0;
//             switch (data[0]) {
//                 case CLIENT_ACTION.START_ATTACK:
//                     player.attacking = 1;
//                     action = 1;
//                     this.world.attack(player);
//                     break;
//                 case CLIENT_ACTION.STOP_ATTACK:
//                     player.attacking = 0;
//                     break;
//                 case CLIENT_ACTION.START_BLOCK:
//                     player.attacking = 2;
//                     action = 2;
//                     break;
//                 case CLIENT_ACTION.STOP_BLOCK:
//                     player.attacking = 0;
//                     action = 3;
//                     break;
//             }
//             sendPacket(this.players.values(), [
//                 [PACKET_TYPE.ACTION, id, action],
//             ]);
//         }
//     }

//     receive(id: number, data: unknown) {
//         // console.log(`Received: ${id}`);
//         this.pipeline.unpack(data, id);
//     }

//     start() {
//         setInterval(this.tick.bind(this), 50);
//         setInterval(this.world.updatePlayerViews.bind(this.world), 2000);
//     }

//     ping(_: unknown[], id: number) {
//         const player = this.players.get(id);
//         if (player) {
//             send(player.socket, [PACKET_TYPE.PING, Date.now()]);
//         }
//     }

//     sendPackets() {
//         for (const player of this.players.values()) {
//             this.updateHandler.send(player);
//         }
//         this.updateHandler.clear();
//     }

//     tick() {
//         this.world.tick(this.updateHandler);
//         this.sendPackets();
//     }
// }
