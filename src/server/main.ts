import { BunduServer } from "./server.js";
import { GameWS, ServerController } from "./websockets.js";
import { World } from "./world.js";
import {
    PACKET_TYPE,
    CLIENT_PACKET_TYPE,
    ClientPacketSchema,
} from "../shared/enums.js";
import { PacketPipeline, Unpacker } from "../shared/unpack.js";
import { round } from "../lib/math.js";
import { createEntities, createGround, createResources } from "./testing.js";
import Logger from "js-logger";

Logger.useDefaults();

const packets = new PacketPipeline();

const world = new World();
const bunduServer = new BunduServer(world, packets);
const controller = new ServerController(bunduServer);

// * This should go in networking.
packets.add(
    CLIENT_PACKET_TYPE.PING,
    new Unpacker(bunduServer.ping.bind(bunduServer), ClientPacketSchema.ping)
);

packets.add(
    CLIENT_PACKET_TYPE.MOVE_UPDATE,
    new Unpacker(
        bunduServer.moveUpdate.bind(bunduServer),
        ClientPacketSchema.moveUpdate
    )
);

packets.add(
    CLIENT_PACKET_TYPE.ROTATE,
    new Unpacker(
        bunduServer.rotatePlayer.bind(bunduServer),
        ClientPacketSchema.rotate
    )
);

packets.add(
    CLIENT_PACKET_TYPE.ACTION,
    new Unpacker(
        bunduServer.playerAction.bind(bunduServer),
        ClientPacketSchema.action
    )
);

packets.add(
    CLIENT_PACKET_TYPE.REQUEST_OBJECT,
    new Unpacker(
        bunduServer.requestObjects.bind(bunduServer),
        ClientPacketSchema.requestObjects
    )
);

bunduServer.start();
controller.start(7777);

// * For testing atm, eventually there will be a world loader.
createEntities(world, 50);
createGround(world);
createResources(world, 5000);

// * Also just for testing.
function createPacket(type: PACKET_TYPE, objects: Iterable<any>) {
    const packet = [type];
    for (let object of objects) {
        packet.push(...object.pack(type));
    }
    return packet;
}

controller.connect = (socket: GameWS) => {
    socket.send(
        JSON.stringify(createPacket(PACKET_TYPE.LOAD_GROUND, world.ground))
    );
};

// * Check memory usage, could be put in a better spot.
setInterval(() => {
    Logger.get("Performance").info(
        `Memory Usage: ${round(process.memoryUsage().heapUsed * 0.000001, 2)}mb`
    );
}, 10000);
