import { ServerController } from "./network/websockets.js";
import { World } from "./game_engine/world.js";
import { round } from "../lib/math.js";
import Logger from "js-logger";
import { createParser } from "./network/packets.js";
import { PositionSystem } from "./systems/position.js";
import { PlayerSystem } from "./systems/player.js";
import { PacketSystem } from "./systems/packet.js";
import { CollisionSystem } from "./systems/collision.js";
import { PACKET, SCHEMA } from "../shared/enums.js";
import { Player } from "./game_objects/player.js";
import random from "../lib/random.js";
import { VisibleObjects } from "./components/player.js";
import SAT from "sat";
import { PacketFactory, send } from "./network/send.js";
import { AttackSystem } from "./systems/attack.js";
import { InventorySystem } from "./systems/inventory.js";
import { ResourceSystem } from "./systems/resource.js";
import { CraftingSystem } from "./systems/crafting.js";
import { HealthSystem } from "./systems/health.js";
import { GroundItemSystem } from "./systems/ground_item.js";
import { WebSocket } from "uWebSockets.js";
import { z } from "zod";
import { validate } from "../shared/type_guard.js";
import {
    GlobalClientPacketHandler,
    GlobalPacketFactory,
    GlobalSocketManager,
} from "./globals.js";
import { createMap } from "./map_loader.js";
import { loadConfigs } from "./configs/loaders/load.js";

Logger.useDefaults();

const world = new World();
loadConfigs();

const playerSystem = new PlayerSystem();
const parser = createParser(playerSystem);

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

createMap(world);

const controller = new ServerController();
controller.start(7777);

const Packet = z.tuple([z.number()]).rest(z.any());
type Packet = z.infer<typeof Packet>;

controller.message = (socket: WebSocket<any>, message: unknown) => {
    const id = GlobalSocketManager.sockets.get(socket);
    if (id && validate(message, Packet)) {
        GlobalClientPacketHandler.add(id, message);
        return;
    }

    parser.unpack(message, { socket: socket });
};

controller.disconnect = (socket: WebSocket<any>) => {
    GlobalSocketManager.sockets.delete(socket);
};

parser.set(
    PACKET.CLIENT.JOIN,
    SCHEMA.CLIENT.JOIN,
    (packet: SCHEMA.CLIENT.JOIN, { socket }: { socket: WebSocket<any> }) => {
        const position = new SAT.Vector(
            random.integer(7500, 7500),
            random.integer(7500, 7500)
        );
        const size = 15;
        const collider = new SAT.Circle(position, size);

        const player = new Player(
            { position, collider, size, solid: false, rotation: 0, speed: 10 },
            {
                name: packet[0],
                score: 0,
                visibleObjects: new VisibleObjects(),
                playerSkin: packet[1],
                backpackSkin: packet[2],

                moveDir: [0, 0],
            }
        );
        GlobalSocketManager.sockets.set(socket, player.id);
        world.addObject(player);

        GlobalPacketFactory.add(
            player.id,
            [PACKET.SERVER.STARTING_INFO],
            () => [player.id]
        );
    }
);

// * Check memory usage, could be put in a better spot.
setInterval(() => {
    Logger.get("Performance").info(
        `Memory Usage: ${round(process.memoryUsage().heapUsed * 0.000001, 2)}mb`
    );
}, 10000);

setInterval(() => {
    // run all client requests for this tick
    GlobalClientPacketHandler.unpack(parser);

    // update the world
    world.update();

    // send accumulated packet data to each client
    for (const player of GlobalPacketFactory.players.keys()) {
        const socket = GlobalSocketManager.sockets.getv(player);
        if (socket !== undefined) {
            send(socket, GlobalPacketFactory.pack(player));
        }
    }

    // clear packet handlers
    GlobalClientPacketHandler.clear();
    GlobalPacketFactory.clear();
}, 50);

// import { PacketFactory } from "./network/send.js";
// import util from "util";

// const factory = new PacketFactory();

// factory.add(0, [2, 1], () => 100);
// factory.add(0, [2, 1], () => 101);

// factory.add(0, [2, 2], () => 100);
// factory.add(0, [2, 2], () => 101);

// console.log(util.inspect(factory.pack(0), false, null, true));
