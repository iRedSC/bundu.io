import { BunduServer } from "./server.js";
import { GameWS, ServerController } from "./websockets.js";
import { World } from "./world.js";
import {
    PACKET_TYPE,
    CLIENT_PACKET_TYPE,
    ClientSchemas,
    ACTION,
} from "../shared/enums.js";
import { PacketPipeline, Unpacker } from "../shared/unpack.js";
import { round } from "../lib/math.js";
import { createEntities, createGround, createResources } from "./testing.js";

const packetPipeline = new PacketPipeline();

const world = new World();
const bunduServer = new BunduServer(world, packetPipeline);
const controller = new ServerController(bunduServer);

packetPipeline.add(
    CLIENT_PACKET_TYPE.PING,
    new Unpacker(bunduServer.ping.bind(bunduServer), ClientSchemas.ping)
);

packetPipeline.add(
    CLIENT_PACKET_TYPE.MOVE_UPDATE,
    new Unpacker(
        bunduServer.moveUpdate.bind(bunduServer),
        ClientSchemas.moveUpdate
    )
);

packetPipeline.add(
    CLIENT_PACKET_TYPE.ROTATE,
    new Unpacker(
        bunduServer.rotatePlayer.bind(bunduServer),
        ClientSchemas.rotate
    )
);

packetPipeline.add(
    CLIENT_PACKET_TYPE.ACTION,
    new Unpacker(
        bunduServer.playerAction.bind(bunduServer),
        ClientSchemas.action
    )
);

bunduServer.start();
controller.start(7777);

createEntities(world, 50);
createGround(world);
createResources(world, 500);

function createPacket(type: PACKET_TYPE, objects: Iterable<any>) {
    const packet = [type];
    console.log(objects);
    for (let object of objects) {
        packet.push(...object.pack(type));
    }
    return packet;
}

controller.connect = (socket: GameWS) => {
    socket.send(
        JSON.stringify(createPacket(PACKET_TYPE.LOAD_GROUND, world.ground))
    );
    socket.send(
        JSON.stringify(
            createPacket(
                PACKET_TYPE.NEW_STRUCTURE,
                world.resources.objects.values()
            )
        )
    );
    socket.send(
        JSON.stringify(
            createPacket(
                PACKET_TYPE.NEW_ENTITY,
                world.entities.objects.values()
            )
        )
    );
};

setInterval(() => {
    console.log(
        `Memory Usage: ${round(process.memoryUsage().heapUsed * 0.000001, 2)}mb`
    );
}, 5000);
// const serverController = new ServerController(bunduServer);

// serverController.start(7777);
