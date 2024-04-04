import { GameWS, ServerController } from "./network/websockets.js";
import { World } from "./game_engine/world.js";
import { round } from "../lib/math.js";
import Logger from "js-logger";
import { createPacketPipeline } from "./network/packets.js";
import { PositionSystem } from "./systems/position.js";
import { PlayerSystem } from "./systems/player.js";
import { PacketSystem } from "./systems/packet.js";
import { CollisionSystem } from "./systems/collision.js";
import { createEntities, createResources } from "./testing.js";
import {
    CLIENT_PACKET_TYPE,
    ClientPacketSchema,
    PACKET_TYPE,
} from "../shared/enums.js";
import { Unpacker } from "../shared/unpack.js";
import { Player } from "./game_objects/player.js";
import random from "../lib/random.js";
import { VisibleObjects } from "./components/player.js";
import SAT from "sat";
import { GameObject } from "./game_engine/game_object.js";
import { send } from "./send.js";
import { GroundData } from "./components/base.js";
import { Ground } from "./game_objects/ground.js";
import { AttackSystem } from "./systems/attack.js";

Logger.useDefaults();

const world = new World();

const positionSystem = new PositionSystem();
const playerSystem = new PlayerSystem();
const pipeline = createPacketPipeline(playerSystem);

const packetSystem = new PacketSystem();
const collisionSystem = new CollisionSystem();
const attackSystem = new AttackSystem();

world
    .addSystem(positionSystem)
    .addSystem(playerSystem)
    .addSystem(packetSystem)
    .addSystem(collisionSystem)
    .addSystem(attackSystem);

const ground: GroundData = {
    collider: new SAT.Box(new SAT.Vector(1000, 1000), 15000, 15000),
    type: 0,
    speedMultiplier: 1,
};

world.addObject(new Ground(ground));
// createEntities(world, 5);
createResources(world, 1000);

const controller = new ServerController();
controller.start(7777);

const players = new Map<number, GameObject>();

controller.connect = (socket: GameWS) => {};
controller.message = (socket: GameWS, message: unknown) => {
    pipeline.unpack(message, socket.id);
};
controller.disconnect = (socket: GameWS) => {
    const player = players.get(socket.id!);
    if (!player) {
        return;
    }
    world.removeObject(player);
    players.delete(socket.id!);
};

pipeline.add(
    CLIENT_PACKET_TYPE.JOIN,
    new Unpacker((packet: ClientPacketSchema.join, id: number) => {
        const socket = controller.sockets.get(id);
        if (!socket) {
            return;
        }
        const position = new SAT.Vector(
            random.integer(7000, 8000),
            random.integer(7000, 8000)
        );
        const size = 15;
        const collider = new SAT.Circle(position, size);

        const player = new Player(
            { position, collider, size, solid: true, rotation: 0, speed: 10 },
            {
                socket: socket,
                name: packet[0],
                visibleObjects: new VisibleObjects(),
                playerSkin: packet[1],
                backpackSkin: packet[2],
                bookSkin: packet[3],

                moveDir: [0, 0],
            }
        );
        socket.id = player.id;
        players.set(player.id, player);
        world.addObject(player);
        send(socket, [PACKET_TYPE.STARTING_INFO, [player.id]]);
    }, ClientPacketSchema.join)
);

// * Check memory usage, could be put in a better spot.
setInterval(() => {
    Logger.get("Performance").info(
        `Memory Usage: ${round(process.memoryUsage().heapUsed * 0.000001, 2)}mb`
    );
}, 10000);

setInterval(() => {
    world.update();
}, 50);
