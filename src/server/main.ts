import { ServerController, SocketManager } from "./network/websockets.js";
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
import { Player } from "./game_objects/player.js";
import random from "../lib/random.js";
import { VisibleObjects } from "./components/player.js";
import SAT from "sat";
import { GameObject } from "./game_engine/game_object.js";
import { send } from "./network/send.js";
import { GroundData } from "./components/base.js";
import { Ground } from "./game_objects/ground.js";
import { AttackSystem } from "./systems/attack.js";
import { InventorySystem } from "./systems/inventory.js";
import { ResourceSystem } from "./systems/resource.js";
import { CraftingSystem } from "./systems/crafting.js";
import { HealthSystem } from "./systems/health.js";
import { GroundItemSystem } from "./systems/ground_item.js";
import { WebSocket } from "uWebSockets.js";

Logger.useDefaults();

const world = new World();

const playerSystem = new PlayerSystem();
const parser = createPacketPipeline(playerSystem);

world
    .addSystem(playerSystem)
    .addSystem(new PositionSystem())
    .addSystem(new PacketSystem())
    .addSystem(new CollisionSystem())
    .addSystem(new AttackSystem())
    .addSystem(new InventorySystem())
    .addSystem(new ResourceSystem())
    .addSystem(new CraftingSystem())
    .addSystem(new HealthSystem())
    .addSystem(new GroundItemSystem());

const ground: GroundData = {
    collider: new SAT.Box(new SAT.Vector(1000, 1000), 15000, 15000),
    type: 0,
    speedMultiplier: 1,
};

world.addObject(new Ground(ground));
// createEntities(world, 5);
createResources(world, 3000);

const controller = new ServerController();
controller.start(7777);

const players = new Map<number, GameObject>();

controller.connect = (socket: WebSocket<any>) => {};
controller.message = (socket: WebSocket<any>, message: unknown) => {
    const id = SocketManager.instance.sockets.get(socket);
    parser.unpack(message, { socket: socket, id: id });
};
// controller.disconnect = (socket: WebSocket<any>) => {
//     const id = SocketManager.instance.sockets.get(socket) || -1;
//     const player = players.get(id);
//     if (!player) {
//         return;
//     }
//     world.removeObject(player);
//     players.delete(id);
// };

parser.set(
    CLIENT_PACKET_TYPE.JOIN,
    ClientPacketSchema.join,
    (
        packet: ClientPacketSchema.join,
        { socket }: { socket: WebSocket<any> }
    ) => {
        const position = new SAT.Vector(
            random.integer(7000, 8000),
            random.integer(7000, 8000)
        );
        const size = 15;
        const collider = new SAT.Circle(position, size);

        const player = new Player(
            { position, collider, size, solid: false, rotation: 0, speed: 10 },
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
        SocketManager.instance.sockets.set(socket, player.id);
        players.set(player.id, player);
        world.addObject(player);
        send(socket, [PACKET_TYPE.STARTING_INFO, [player.id]]);
    }
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
